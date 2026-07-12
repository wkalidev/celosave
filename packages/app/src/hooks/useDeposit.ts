"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { erc20Abi, aavePoolAbi } from "@/lib/abis";
import { AAVE_POOL, getTokenContracts, type SupportedToken } from "@/lib/contracts";
import { addDeposit } from "@/lib/savings-store";
import { sendCip64Transaction } from "@/lib/cip64";
import { toFriendlyError } from "@/lib/error-utils";
import { savePendingTx, loadPendingTx, clearPendingTx } from "@/lib/pending-tx";

export type DepositStep = "idle" | "checking" | "approving" | "supplying" | "success" | "error";

export function useDeposit(token: SupportedToken) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  // Recover a supply tx that was still pending when the page was reloaded.
  useEffect(() => {
    if (!address || !publicClient) return;
    const key = `deposit:${token}:${address}`;
    const pending = loadPendingTx(key);
    if (!pending) return;

    (async () => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: pending.txHash,
          timeout: 30_000,
        });
        if (receipt.status === "success") {
          addDeposit(chainId ?? 42220, address, token, pending.amountRaw ? BigInt(pending.amountRaw) : 0n);
          setTxHash(pending.txHash);
          setStep("success");
        } else {
          setError("Your previous deposit transaction failed on-chain.");
          setStep("error");
        }
      } catch {
        // Still pending or lookup failed — leave it for the next check rather
        // than guessing; the user can retry a fresh deposit if truly stuck.
      } finally {
        clearPendingTx(key);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient]);

  async function deposit(amount: bigint) {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    const { token: tokenAddress, feeAdapter } = getTokenContracts(token);
    const pendingKey = `deposit:${token}:${address}`;

    setError(null);
    setStep("checking");

    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, AAVE_POOL],
      });

      if (allowance < amount) {
        setStep("approving");

        if (allowance > 0n) {
          // Defensively reset a nonzero allowance to 0 before setting a new
          // value — some ERC20s revert on approve() when the current
          // allowance is already nonzero and the new value differs.
          const resetHash = await sendCip64Transaction(walletClient, {
            account: address,
            to: tokenAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [AAVE_POOL, 0n],
            }),
            // Pay gas in the stablecoin being deposited — no CELO needed.
            feeCurrency: feeAdapter,
          });
          await publicClient.waitForTransactionReceipt({ hash: resetHash });
        }

        const approveHash = await sendCip64Transaction(walletClient, {
          account: address,
          to: tokenAddress,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [AAVE_POOL, amount],
          }),
          feeCurrency: feeAdapter,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep("supplying");

      const supplyHash = await sendCip64Transaction(walletClient, {
        account: address,
        to: AAVE_POOL,
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "supply",
          args: [tokenAddress, amount, address, 0],
        }),
        feeCurrency: feeAdapter,
      });

      savePendingTx(pendingKey, { txHash: supplyHash, amountRaw: amount.toString() });
      await publicClient.waitForTransactionReceipt({ hash: supplyHash });
      clearPendingTx(pendingKey);

      addDeposit(chainId ?? 42220, address, token, amount);
      setTxHash(supplyHash);
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

  return { deposit, step, error, txHash, reset };
}
