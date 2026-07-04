import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import { createQuote, consumeQuote } from "../lib/quotes";
import { getCountry, usdToLocal } from "../lib/countries";
import { detectCarrier } from "../lib/carrier";
import {
  reserveAirtimePayment,
  markAirtimePaymentCompleted,
  markAirtimePaymentFailed,
  getAirtimePayment,
} from "../lib/payments";
import { quoteRequestSchema, topupRequestSchema, statusQuerySchema } from "../lib/validation";
import { sendAirtime } from "../services/at";
import {
  getTopupOffers,
  findClosestOffer,
  eurCentsToUsd,
  createTopupPurchase,
} from "../services/zendit";
import { verifyUsdtTransfer } from "../services/celo";

const MARKUP_BPS = 150; // 1.5%
const USDT_DECIMALS = 6;
// No hardcoded fallback: assertProductionConfigSafe() refuses to boot the
// process if this is unset, so by the time routes run it is always present.
const TREASURY = process.env.TREASURY_ADDRESS as string;

const router = Router();

// Tighter limits than the global limiter for the two routes that touch
// money: quote generation (cheap but scriptable) and topup (verifies a
// tx on-chain and calls a paid provider on every request).
const quoteLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false });
const topupLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

// POST /api/airtime/quote
// Body: { phone: string, countryCode: string, usdAmount: number }
router.post("/quote", quoteLimiter, async (req: Request, res: Response) => {
  const parsed = quoteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const { phone, countryCode, usdAmount } = parsed.data;

  try {
    const country = getCountry(countryCode);

    let baseUsdAmount: number;
    let localAmount: number;
    let localCurrency: string;
    let zenditOfferId: string | undefined;

    if (country.provider === "zendit") {
      const offers = await getTopupOffers(countryCode);
      const carrierHint = detectCarrier(phone, countryCode);
      const offer = findClosestOffer(offers, usdAmount, carrierHint);
      if (!offer) {
        return res.status(502).json({ error: `No top-up offers available for ${countryCode}` });
      }
      zenditOfferId = offer.offerId;
      baseUsdAmount = eurCentsToUsd(offer.price.fixed);
      localAmount = offer.send.fixed / offer.send.currencyDivisor;
      localCurrency = offer.send.currency;
    } else {
      // Africa's Talking — arbitrary amount in local currency
      baseUsdAmount = usdAmount;
      localAmount = usdToLocal(usdAmount, country);
      localCurrency = country.currency;
    }

    const markupUsd = (baseUsdAmount * MARKUP_BPS) / 10000;
    const totalUsd = baseUsdAmount + markupUsd;
    const usdtRaw = BigInt(Math.round(totalUsd * 10 ** USDT_DECIMALS));

    const quote = createQuote({
      phone,
      countryCode,
      baseUsdAmount,
      markupUsdAmount: markupUsd,
      totalUsdAmount: totalUsd,
      usdtRaw,
      localAmount,
      localCurrency,
      provider: country.provider,
      zenditOfferId,
    });

    res.json({
      quoteId: quote.id,
      phone: quote.phone,
      countryCode,
      baseUsdAmount: Number(quote.baseUsdAmount.toFixed(4)),
      markupUsdAmount: Number(quote.markupUsdAmount.toFixed(4)),
      totalUsdAmount: Number(quote.totalUsdAmount.toFixed(4)),
      usdtRaw: quote.usdtRaw.toString(),
      localAmount: quote.localAmount,
      localCurrency: quote.localCurrency,
      expiresAt: quote.expiresAt,
      treasuryAddress: TREASURY,
      provider: quote.provider,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Quote failed";
    res.status(400).json({ error: msg });
  }
});

// POST /api/airtime/topup
// Body: { quoteId: string, txHash: string }
router.post("/topup", topupLimiter, async (req: Request, res: Response) => {
  const parsed = topupRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const { quoteId, txHash } = parsed.data;

  try {
    const quote = consumeQuote(quoteId);
    if (!quote) {
      return res.status(400).json({ error: "Quote expired or not found" });
    }

    let verifiedAmount = quote.usdtRaw;
    if (process.env.SANDBOX_SKIP_VERIFY !== "true") {
      const verification = await verifyUsdtTransfer(txHash, TREASURY, quote.usdtRaw);
      if (!verification.valid) {
        return res.status(402).json({ error: `Payment invalid: ${verification.reason}` });
      }
      verifiedAmount = verification.actualAmount ?? quote.usdtRaw;
    }

    // Atomically claim this txHash BEFORE calling any provider. This INSERT
    // is synchronous (no await inside reserveAirtimePayment) so two
    // concurrent requests replaying the same txHash against different
    // quotes can never both pass — the second always hits the PRIMARY KEY
    // constraint and is rejected here, before a second airtime send happens.
    const reservation = reserveAirtimePayment({
      txHash,
      quoteId,
      phone: quote.phone,
      provider: quote.provider,
      amountRaw: verifiedAmount,
    });
    if (!reservation.ok) {
      return res.status(409).json({ error: "This payment has already been used for a different order" });
    }

    if (quote.provider === "zendit") {
      const txnId = uuidv4();
      let result;
      try {
        result = await createTopupPurchase(txnId, quote.zenditOfferId!, quote.phone);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Zendit purchase failed";
        markAirtimePaymentFailed(txHash, msg);
        return res.status(502).json({
          error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
          txHash,
        });
      }

      if (result.status === "FAILED") {
        markAirtimePaymentFailed(txHash, "Zendit top-up failed");
        return res.status(502).json({
          error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
          txHash,
        });
      }

      const sendAmount = result.send != null && result.sendCurrencyDivisor != null
        ? `${result.sendCurrency ?? quote.localCurrency} ${(result.send / result.sendCurrencyDivisor).toFixed(2)}`
        : `${quote.localCurrency} ${quote.localAmount.toFixed(2)}`;

      markAirtimePaymentCompleted(txHash, result.confirmation?.confirmationNumber ?? result.transactionId, sendAmount);

      return res.json({
        success: true,
        requestId: result.confirmation?.confirmationNumber ?? result.transactionId,
        phone: quote.phone,
        amount: sendAmount,
        txHash,
      });
    }

    // Africa's Talking path
    let result;
    try {
      result = await sendAirtime({
        phoneNumber: quote.phone,
        currencyCode: quote.localCurrency,
        amount: quote.localAmount,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Airtime send failed";
      markAirtimePaymentFailed(txHash, msg);
      return res.status(502).json({
        error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
        txHash,
      });
    }

    if (result.numSent === 0 && result.errorMessage && result.errorMessage !== "None") {
      markAirtimePaymentFailed(txHash, `Airtime provider error: ${result.errorMessage}`);
      return res.status(502).json({
        error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
        txHash,
      });
    }

    const response = result.responses?.[0];
    if (!response) {
      markAirtimePaymentFailed(txHash, "No response from airtime provider");
      return res.status(502).json({
        error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
        txHash,
      });
    }

    const isSuccess =
      response.status === "Success" ||
      response.status === "Sent" ||
      (response.errorMessage === "None" && result.numSent > 0);

    if (isSuccess) {
      markAirtimePaymentCompleted(txHash, response.requestId, response.amount);
      return res.json({
        success: true,
        requestId: response.requestId,
        phone: quote.phone,
        amount: response.amount,
        txHash,
      });
    }

    markAirtimePaymentFailed(txHash, `Airtime send failed: ${response.errorMessage || response.status}`);
    res.status(502).json({
      error: "Your payment was received but airtime delivery failed. Check status with your transaction hash.",
      txHash,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Topup failed";
    res.status(500).json({ error: msg });
  }
});

// GET /api/airtime/status?txHash=0x...
// Lets a user check on a payment whose delivery failed after their on-chain
// transfer was already verified and consumed, since there is no automatic
// crypto refund path today.
router.get("/status", statusLimiter, (req: Request, res: Response) => {
  const parsed = statusQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  const record = getAirtimePayment(parsed.data.txHash);
  if (!record) {
    return res.status(404).json({ error: "No payment found for this transaction hash" });
  }

  res.json({
    txHash: record.txHash,
    status: record.status,
    phone: record.phone,
    provider: record.provider,
    requestId: record.requestId,
    deliveryAmount: record.deliveryAmount,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
});

export default router;
