"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { erc20Abi, aavePoolAbi } from "@/lib/abis";
import {
  USDT,
  AAVE_POOL,
  USDT_FEE_ADAPTER,
} from "@/lib/contracts";
import { addDeposit } from "@/lib/savings-store";

export type DepositStep = "idle" | "approving" | "supplying" | "success" | "error";

export function useDeposit() {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  async function deposit(amount: bigint) {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setStep("approving");

    try {
      // Step 1: Approve Aave Pool to spend USDT
      // feeCurrency pays gas in USDT via CIP-64 (no CELO balance needed)
      const approveHash = await walletClient.sendTransaction({
        account: address,
        to: USDT,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [AAVE_POOL, amount],
        }),
        // @ts-ignore — Celo CIP-64 extension; feeCurrency adapter pays gas in USDT
        feeCurrency: USDT_FEE_ADAPTER,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setStep("supplying");

      // Step 2: Supply USDT into Aave V3
      const supplyHash = await walletClient.sendTransaction({
        account: address,
        to: AAVE_POOL,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "supply",
          args: [USDT, amount, address, 0],
        }),
        // @ts-ignore — Celo CIP-64 extension
        feeCurrency: USDT_FEE_ADAPTER,
      });

      await publicClient.waitForTransactionReceipt({ hash: supplyHash });

      // Record principal for yield tracking
      addDeposit(chainId ?? 42220, address, "USDT", amount);

      setTxHash(supplyHash);
      setStep("success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg);
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { deposit, step, error, txHash, reset };
}
