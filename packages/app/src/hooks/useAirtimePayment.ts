"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { erc20Abi } from "@/lib/abis";
import { USDT, USDT_FEE_ADAPTER } from "@/lib/contracts";
import { toFriendlyError } from "@/lib/error-utils";
import { assertValidPaymentAddress } from "@/lib/address-utils";
import { tagCalldata } from "@/lib/attribution";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export interface AirtimeQuote {
  quoteId: string;
  phone: string;
  countryCode: string;
  baseUsdAmount: number;
  markupUsdAmount: number;
  totalUsdAmount: number;
  usdtRaw: string; // bigint as decimal string
  localAmount: number;
  localCurrency: string;
  expiresAt: number;
  treasuryAddress: `0x${string}`;
}

export type AirtimeStep =
  | "idle"
  | "quoting"
  | "quoted"
  | "paying"
  | "confirming"
  | "success"
  | "error";

export interface AirtimeResult {
  requestId: string;
  phone: string;
  amount: string;
  txHash: string;
}

export function useAirtimePayment() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  const [step, setStep] = useState<AirtimeStep>("idle");
  const [quote, setQuote] = useState<AirtimeQuote | null>(null);
  const [result, setResult] = useState<AirtimeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getQuote(phone: string, countryCode: string, usdAmount: number) {
    setStep("quoting");
    setError(null);
    setQuote(null);

    try {
      const res = await fetch(`${BACKEND}/api/airtime/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, countryCode, usdAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      setQuote(data as AirtimeQuote);
      setStep("quoted");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Quote failed");
      setStep("error");
    }
  }

  async function pay() {
    if (!quote || !walletClient || !address || !publicClient) {
      setError("Not ready");
      return;
    }

    setStep("paying");
    setError(null);

    try {
      assertValidPaymentAddress(quote.treasuryAddress);

      const amount = BigInt(quote.usdtRaw);

      let txHash: `0x${string}`;
      try {
        // Transfer USDT to treasury (airtime cost + 1.5% markup)
        txHash = await walletClient.sendTransaction({
          account: address,
          to: USDT,
          chain: celo,
          // Celo Builders attribution tag — no-op until
          // NEXT_PUBLIC_ATTRIBUTION_TAG is set. See lib/attribution.ts.
          data: tagCalldata(encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [quote.treasuryAddress, amount],
          })),
          // @ts-ignore — Celo CIP-64 extension
          feeCurrency: USDT_FEE_ADAPTER,
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      } catch (e: unknown) {
        throw new Error(toFriendlyError(e));
      }

      setStep("confirming");

      // Tell backend to verify tx and send airtime
      const res = await fetch(`${BACKEND}/api/airtime/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId, txHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Topup failed");

      setResult(data as AirtimeResult);
      setStep("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setQuote(null);
    setResult(null);
    setError(null);
  }

  return { step, quote, result, error, getQuote, pay, reset };
}
