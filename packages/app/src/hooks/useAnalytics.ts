"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { erc20Abi } from "@/lib/abis";
import { USDC, USDC_FEE_ADAPTER } from "@/lib/contracts";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

// $0.001 USDC = 1000 raw units
const ANALYTICS_PRICE_RAW = 1000n;

export interface ProtocolStats {
  protocol: string;
  version: string;
  timestamp: number;
  aave: { usdtApyPct: number; usdcApyPct: number };
  treasury: { usdtAToken: string; usdcAToken: string };
  fees: { yieldBps: number; billPayBps: number };
}

export type AnalyticsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "paying" }
  | { status: "loaded"; data: ProtocolStats }
  | { status: "error"; message: string };

export function useAnalytics() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [state, setState] = useState<AnalyticsState>({ status: "idle" });
  const [payTo, setPayTo] = useState<string | null>(null);

  async function fetchStats(txHash?: string) {
    setState({ status: "loading" });

    const headers: Record<string, string> = {};
    if (txHash) {
      headers["X-PAYMENT"] = Buffer.from(
        JSON.stringify({ txHash, network: "celo-mainnet", asset: USDC })
      ).toString("base64");
    }

    const res = await fetch(`${BACKEND}/api/analytics/protocol`, { headers });

    if (res.ok) {
      const data = await res.json() as ProtocolStats;
      setState({ status: "loaded", data });
      return;
    }

    if (res.status === 402) {
      const body = await res.json() as { accepts: Array<{ payTo: string }> };
      const addr = body.accepts?.[0]?.payTo;
      if (addr) setPayTo(addr);
      setState({ status: "idle" }); // let UI call pay()
      return;
    }

    const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
    setState({ status: "error", message: err.error ?? res.statusText });
  }

  async function pay() {
    if (!walletClient || !address || !publicClient || !payTo) {
      setState({ status: "error", message: "Wallet not connected or payTo not set" });
      return;
    }

    setState({ status: "paying" });
    try {
      const txHash = await walletClient.sendTransaction({
        account: address,
        to: USDC,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [payTo as `0x${string}`, ANALYTICS_PRICE_RAW],
        }),
        // @ts-ignore — CIP-64
        feeCurrency: USDC_FEE_ADAPTER,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchStats(txHash);
    } catch (e: unknown) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Payment failed" });
    }
  }

  // Auto-fetch on mount (will get 402 if no payment, then wait for pay())
  useEffect(() => { fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, payTo, pay, refresh: () => fetchStats() };
}
