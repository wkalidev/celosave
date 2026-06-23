import { Router, Request, Response } from "express";
import { fetchProtocolStats } from "../services/protocol-stats";
import { verifyUsdcTransfer } from "../services/celo-usdc";

const router = Router();

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
router.get("/protocol", async (req: Request, res: Response) => {
  const paymentHeader = req.headers["x-payment"] as string | undefined;

  if (!paymentHeader) {
    return x402Response(res, req.originalUrl);
  }

  // Decode and verify payment
  let txHash: string;
  try {
    const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const payload = JSON.parse(decoded) as { txHash: string };
    txHash = payload.txHash;
    if (!txHash?.startsWith("0x")) throw new Error("invalid txHash");
  } catch {
    return res.status(400).json({ error: "Invalid X-PAYMENT header format" });
  }

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

  try {
    const stats = await fetchProtocolStats();
    return res.json(stats);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stats fetch failed";
    return res.status(503).json({ error: msg });
  }
});

export default router;
