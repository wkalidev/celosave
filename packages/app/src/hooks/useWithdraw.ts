"use client";

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { erc20Abi, aavePoolAbi } from "@/lib/abis";
import {
  USDT,
  AAVE_POOL,
  USDT_FEE_ADAPTER,
  TREASURY,
} from "@/lib/contracts";
import { getPrincipal, reducePrincipal, clearPrincipal } from "@/lib/savings-store";
import { calcFee } from "@/lib/aave-utils";

export type WithdrawStep =
  | "idle"
  | "withdrawing"
  | "sending_fee"
  | "success"
  | "error";

export function useWithdraw() {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // aTokenBalance: full current balance (principal + yield), in raw units (6 decimals)
  async function withdraw(aTokenBalance: bigint) {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setStep("withdrawing");

    const cid = chainId ?? 42220;
    const principal = getPrincipal(cid, address, "USDT");
    const fee = calcFee(aTokenBalance, principal);

    try {
      // Step 1: Withdraw all from Aave — user receives full aTokenBalance in USDT
      // type(uint256).max = withdraw everything
      const MAX_UINT256 = 2n ** 256n - 1n;

      const withdrawHash = await walletClient.sendTransaction({
        account: address,
        to: AAVE_POOL,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "withdraw",
          args: [USDT, MAX_UINT256, address],
        }),
        // @ts-ignore — Celo CIP-64 extension
        feeCurrency: USDT_FEE_ADAPTER,
      });

      await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

      // Step 2: Send protocol fee to treasury (only if there is yield)
      if (fee > 0n) {
        setStep("sending_fee");

        const feeHash = await walletClient.sendTransaction({
          account: address,
          to: USDT,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [TREASURY, fee],
          }),
          // @ts-ignore — Celo CIP-64 extension
          feeCurrency: USDT_FEE_ADAPTER,
        });

        await publicClient.waitForTransactionReceipt({ hash: feeHash });
        setTxHash(feeHash);
      } else {
        setTxHash(withdrawHash);
      }

      // Clear stored principal after full withdrawal
      clearPrincipal(cid, address, "USDT");

      setStep("success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      setError(msg);
      setStep("error");

      // Roll back principal reduction on error
      // (no action needed — we haven't mutated principal yet)
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { withdraw, step, error, txHash, reset };
}
