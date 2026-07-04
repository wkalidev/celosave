import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { fetchProtocolStats } from "../services/protocol-stats";
import { verifyUsdcTransfer } from "../services/celo-usdc";
import { reserveAnalyticsPayment } from "../lib/payments";
import { x402PayloadSchema } from "../lib/validation";

const router = Router();

const protocolLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

// $0.001 USDC per analytics request (1000 raw units, 6 decimals)
const ANALYTICS_PRICE_RAW = 1000n;
// Server wallet receives analytics payments (ThirdWeb server wallet)
const SERVER_WALLET = process.env.SERVER_WALLET_ADDRESS ?? "";
// USDC on Celo — source: docs.celo.org
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

function x402Response(res: Response, resource: string) {
  return res.status(402).json({
    x402Version: 1,
    error: "Payment required — include X-PAYMENT header with USDC transfer proof",
    accepts: [
      {
        scheme: "exact",
        network: "celo-mainnet",
        maxAmountRequired: ANALYTICS_PRICE_RAW.toString(),
        resource,
        description: "CeloSave Protocol Analytics v1",
        mimeType: "application/json",
        payTo: SERVER_WALLET,
        maxTimeoutSeconds: 300,
        asset: USDC,
        extra: { decimals: 6 },
      },
    ],
  });
}

// GET /api/analytics/protocol
// Without payment → 402 with payment requirements (x402 spec)
// With X-PAYMENT: base64({"txHash":"0x..."}) → verified stats
router.get("/protocol", protocolLimiter, async (req: Request, res: Response) => {
  const paymentHeader = req.headers["x-payment"] as string | undefined;

  if (!paymentHeader) {
    return x402Response(res, req.originalUrl);
  }

  // Decode and verify payment
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Invalid X-PAYMENT header format" });
  }

  const parsed = x402PayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid X-PAYMENT payload" });
  }
  const { txHash } = parsed.data;

  if (!SERVER_WALLET) {
    return res.status(503).json({ error: "SERVER_WALLET_ADDRESS not configured" });
  }

  const verification = await verifyUsdcTransfer(
    txHash as `0x${string}`,
    SERVER_WALLET,
    ANALYTICS_PRICE_RAW
  );

  if (!verification.valid) {
    return res.status(402).json({
      error: `Payment verification failed: ${verification.reason}`,
    });
  }

  // Atomic, synchronous reservation — same replay-prevention pattern as
  // airtime payments. One verified USDC transfer can only ever pay for one
  // analytics response.
  const reservation = reserveAnalyticsPayment(txHash, ANALYTICS_PRICE_RAW);
  if (!reservation.ok) {
    return res.status(409).json({ error: "This payment has already been used for a different request" });
  }

  try {
    const stats = await fetchProtocolStats();
    return res.json(stats);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stats fetch failed";
    return res.status(503).json({ error: msg });
  }
});

export default router;
