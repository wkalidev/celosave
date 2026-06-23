import { Router, Request, Response } from "express";
import { createQuote, consumeQuote } from "../lib/quotes";
import { getCountry, usdToLocal } from "../lib/countries";
import { sendAirtime } from "../services/at";
import { verifyUsdtTransfer } from "../services/celo";

const MARKUP_BPS = 150; // 1.5%
const USDT_DECIMALS = 6;
// Source: .env NEXT_PUBLIC_TREASURY_ADDRESS
const TREASURY = process.env.TREASURY_ADDRESS ?? "0x3AC95343494979d0c92195D387D278DCB3d6d595";

const router = Router();

// POST /api/airtime/quote
// Body: { phone: string, countryCode: string, usdAmount: number }
router.post("/quote", (req: Request, res: Response) => {
  try {
    const { phone, countryCode, usdAmount } = req.body as {
      phone: string;
      countryCode: string;
      usdAmount: number;
    };

    if (!phone || !countryCode || !usdAmount) {
      return res.status(400).json({ error: "phone, countryCode, usdAmount required" });
    }

    if (usdAmount < 0.5 || usdAmount > 50) {
      return res.status(400).json({ error: "Amount must be between $0.50 and $50" });
    }

    const country = getCountry(countryCode);
    const markupUsd = (usdAmount * MARKUP_BPS) / 10000;
    const totalUsd = usdAmount + markupUsd;

    // Raw USDT amount (6 decimals)
    const usdtRaw = BigInt(Math.round(totalUsd * 10 ** USDT_DECIMALS));
    const localAmount = usdToLocal(usdAmount, country);

    const quote = createQuote({
      phone,
      countryCode,
      baseUsdAmount: usdAmount,
      markupUsdAmount: markupUsd,
      totalUsdAmount: totalUsd,
      usdtRaw,
      localAmount,
      localCurrency: country.currency,
    });

    res.json({
      quoteId: quote.id,
      phone: quote.phone,
      countryCode,
      baseUsdAmount: quote.baseUsdAmount,
      markupUsdAmount: Number(quote.markupUsdAmount.toFixed(4)),
      totalUsdAmount: Number(quote.totalUsdAmount.toFixed(4)),
      // Send as string to avoid JS BigInt serialization issues
      usdtRaw: quote.usdtRaw.toString(),
      localAmount: quote.localAmount,
      localCurrency: quote.localCurrency,
      expiresAt: quote.expiresAt,
      treasuryAddress: TREASURY,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Quote failed";
    res.status(400).json({ error: msg });
  }
});

// POST /api/airtime/topup
// Body: { quoteId: string, txHash: string }
router.post("/topup", async (req: Request, res: Response) => {
  try {
    const { quoteId, txHash } = req.body as {
      quoteId: string;
      txHash: string;
    };

    if (!quoteId || !txHash) {
      return res.status(400).json({ error: "quoteId and txHash required" });
    }

    // Consume quote (single-use)
    const quote = consumeQuote(quoteId);
    if (!quote) {
      return res.status(400).json({ error: "Quote expired or not found" });
    }

    // Verify the on-chain payment
    const verification = await verifyUsdtTransfer(
      txHash as `0x${string}`,
      TREASURY,
      quote.usdtRaw
    );

    if (!verification.valid) {
      return res.status(402).json({ error: `Payment invalid: ${verification.reason}` });
    }

    // Send airtime via Africa's Talking
    const result = await sendAirtime({
      phoneNumber: quote.phone,
      currencyCode: quote.localCurrency,
      amount: quote.localAmount,
    });

    const response = result.responses?.[0];
    if (!response) {
      return res.status(502).json({ error: "No response from airtime provider" });
    }

    if (response.status === "Success") {
      return res.json({
        success: true,
        requestId: response.requestId,
        phone: quote.phone,
        amount: response.amount,
        txHash,
      });
    }

    res.status(502).json({
      error: `Airtime send failed: ${response.errorMessage || response.status}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Topup failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
