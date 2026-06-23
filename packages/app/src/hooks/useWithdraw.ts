"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { aavePoolAbi } from "@/lib/abis";
import { AAVE_POOL, getTokenContracts, type SupportedToken } from "@/lib/contracts";
import { clearPrincipal } from "@/lib/savings-store";

export type WithdrawStep = "idle" | "withdrawing" | "success" | "error";

export function useWithdraw(token: SupportedToken) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  async function withdraw() {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    const { token: tokenAddress, feeAdapter } = getTokenContracts(token);
    const MAX_UINT256 = 2n ** 256n - 1n;

    setError(null);
    setStep("withdrawing");

    try {
      const withdrawHash = await walletClient.sendTransaction({
        account: address,
        to: AAVE_POOL,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "withdraw",
          args: [tokenAddress, MAX_UINT256, address],
        }),
        // @ts-ignore — Celo CIP-64: pay gas in stablecoin, no CELO needed
        feeCurrency: feeAdapter,
      });

      await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

      clearPrincipal(chainId ?? 42220, address, token);
      setTxHash(withdrawHash);
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

  return { withdraw, step, error, txHash, reset };
}
