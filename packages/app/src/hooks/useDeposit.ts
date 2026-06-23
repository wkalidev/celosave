"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { erc20Abi, aavePoolAbi } from "@/lib/abis";
import { AAVE_POOL, getTokenContracts, type SupportedToken } from "@/lib/contracts";
import { addDeposit } from "@/lib/savings-store";

export type DepositStep = "idle" | "approving" | "supplying" | "success" | "error";

export function useDeposit(token: SupportedToken) {
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

    const { token: tokenAddress, feeAdapter } = getTokenContracts(token);

    setError(null);
    setStep("approving");

    try {
      // Step 1: Approve Aave Pool to spend token
      const approveHash = await walletClient.sendTransaction({
        account: address,
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [AAVE_POOL, amount],
        }),
        // @ts-ignore — Celo CIP-64: pay gas in stablecoin, no CELO needed
        feeCurrency: feeAdapter,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      setStep("supplying");

      // Step 2: Supply into Aave V3
      const supplyHash = await walletClient.sendTransaction({
        account: address,
        to: AAVE_POOL,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "supply",
          args: [tokenAddress, amount, address, 0],
        }),
        // @ts-ignore — Celo CIP-64
        feeCurrency: feeAdapter,
      });

      await publicClient.waitForTransactionReceipt({ hash: supplyHash });

      addDeposit(chainId ?? 42220, address, token, amount);
      setTxHash(supplyHash);
      setStep("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
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
