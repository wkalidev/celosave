"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { aavePoolAbi } from "@/lib/abis";
import { AAVE_POOL, getTokenContracts, type SupportedToken } from "@/lib/contracts";
import { clearPrincipal } from "@/lib/savings-store";
import { pickFeeCurrency, NO_FEE_CURRENCY_MESSAGE } from "@/lib/fee-currency";
import { toFriendlyError } from "@/lib/error-utils";
import { savePendingTx, loadPendingTx, clearPendingTx } from "@/lib/pending-tx";

export type WithdrawStep = "idle" | "checking" | "withdrawing" | "success" | "error";

export function useWithdraw(token: SupportedToken) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // Recover a withdraw tx that was still pending when the page was reloaded.
  useEffect(() => {
    if (!address || !publicClient) return;
    const key = `withdraw:${token}:${address}`;
    const pending = loadPendingTx(key);
    if (!pending) return;

    (async () => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: pending.txHash,
          timeout: 30_000,
        });
        if (receipt.status === "success") {
          clearPrincipal(chainId ?? 42220, address, token);
          setTxHash(pending.txHash);
          setStep("success");
        } else {
          setError("Your previous withdrawal transaction failed on-chain.");
          setStep("error");
        }
      } catch {
        // Still pending or lookup failed — leave it for a fresh attempt.
      } finally {
        clearPendingTx(key);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient]);

  async function withdraw() {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    const { token: tokenAddress } = getTokenContracts(token);
    const MAX_UINT256 = 2n ** 256n - 1n;
    const pendingKey = `withdraw:${token}:${address}`;

    setError(null);
    setStep("checking");

    try {
      const choice = await pickFeeCurrency(publicClient, address);
      if (!choice) {
        setError(NO_FEE_CURRENCY_MESSAGE);
        setStep("error");
        return;
      }

      setStep("withdrawing");

      const withdrawHash = await walletClient.sendTransaction({
        account: address,
        to: AAVE_POOL,
        chain: celo,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "withdraw",
          args: [tokenAddress, MAX_UINT256, address],
        }),
        // @ts-ignore — Celo CIP-64: pay gas in whichever currency the wallet can afford
        feeCurrency: choice.feeCurrency,
      });

      savePendingTx(pendingKey, { txHash: withdrawHash });
      await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
      clearPendingTx(pendingKey);

      clearPrincipal(chainId ?? 42220, address, token);
      setTxHash(withdrawHash);
      setStep("success");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
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
