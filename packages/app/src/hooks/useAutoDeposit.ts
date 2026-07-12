"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { encodeFunctionData, isAddress } from "viem";
import { erc20Abi } from "@/lib/abis";
import { routerAbi, DEFAULT_INTERVAL_SECONDS, DEFAULT_APPROVAL_CYCLES } from "@/lib/router-abi";
import { AUTO_DEPOSIT_ROUTER, CUSD } from "@/lib/contracts";
import { sendCip64Transaction } from "@/lib/cip64";
import { toFriendlyError } from "@/lib/error-utils";
import { savePendingTx, loadPendingTx, clearPendingTx } from "@/lib/pending-tx";

export type AutoDepositStep =
  | "idle"
  | "checking"
  | "approving"
  | "setting_plan"
  | "subscribed"
  | "cancelling"
  | "cancelled"
  | "depositing"
  | "deposited"
  | "error";

export interface AutoDepositPlan {
  monthlyAmount: bigint;
  interval: number;
  nextExecutionTime: number;
  active: boolean;
}

// Returns an error message if the addresses this hook depends on aren't
// configured or aren't strictly valid EIP-55 addresses, otherwise null.
// Same discipline as the old assertValidAddresses() in the (now removed)
// useSuperfluidStream.ts — that file's regression tests exist because a
// loose/non-checksummed check let a mistyped address pass silently until
// encodeFunctionData threw at runtime on first use. Strict isAddress() here
// catches that class of bug immediately instead.
export function assertValidAddresses(): string | null {
  if (!AUTO_DEPOSIT_ROUTER) {
    return "Auto-Save's router contract has not been deployed yet.";
  }
  const required: Array<[string, string]> = [
    ["router", AUTO_DEPOSIT_ROUTER],
    ["cUSD", CUSD],
  ];
  for (const [label, addr] of required) {
    if (!isAddress(addr)) {
      return `Invalid ${label} address configured — refusing to proceed.`;
    }
  }
  return null;
}

// How many more cycles the user's live on-chain allowance can cover at their
// configured monthlyAmount. This is the actual, contract-enforced ceiling
// (not a UI-side estimate) — transferFrom simply reverts once this hits
// zero, with no partial-charge possibility.
export function cyclesRemaining(allowance: bigint, monthlyAmount: bigint): number {
  if (monthlyAmount <= 0n) return 0;
  return Number(allowance / monthlyAmount);
}

// Warn the user when this many or fewer cycles remain on their allowance,
// so they can re-approve before deposits silently stop.
export const LOW_ALLOWANCE_WARNING_CYCLES = 1;

// Human-readable label for a plan's next eligible deposit time.
export function nextDepositLabel(nextExecutionTime: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (nextExecutionTime === 0) return "Not scheduled";
  if (nextExecutionTime <= nowSeconds) return "Ready now";
  return new Date(nextExecutionTime * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function encodeApprove(spender: `0x${string}`, amount: bigint) {
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

export function encodeSetPlan(monthlyAmount: bigint, interval: number) {
  return encodeFunctionData({ abi: routerAbi, functionName: "setPlan", args: [monthlyAmount, BigInt(interval)] });
}

export function encodeCancelPlan() {
  return encodeFunctionData({ abi: routerAbi, functionName: "cancelPlan", args: [] });
}

export function encodeDepositFor(user: `0x${string}`, amount: bigint) {
  return encodeFunctionData({ abi: routerAbi, functionName: "depositFor", args: [user, amount] });
}

export function useAutoDeposit() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  const [step, setStep] = useState<AutoDepositStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AutoDepositPlan | null>(null);
  const [allowance, setAllowance] = useState<bigint>(0n);

  const refresh = useCallback(async () => {
    if (!address || !publicClient || !AUTO_DEPOSIT_ROUTER) return;
    try {
      const [planData, allowanceData] = await Promise.all([
        publicClient.readContract({
          address: AUTO_DEPOSIT_ROUTER,
          abi: routerAbi,
          functionName: "plans",
          args: [address],
        }),
        publicClient.readContract({
          address: CUSD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, AUTO_DEPOSIT_ROUTER],
        }),
      ]);
      const [monthlyAmount, interval, nextExecutionTime, active] = planData;
      setPlan({
        monthlyAmount,
        interval: Number(interval),
        nextExecutionTime: Number(nextExecutionTime),
        active,
      });
      setAllowance(allowanceData);
    } catch {
      // Read failure (RPC hiccup, router not deployed yet) — leave prior
      // state rather than clobbering a good read with a transient error.
    }
  }, [address, publicClient]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Recover a pending subscribe/cancel/deposit tx across a page reload —
  // same pattern as useDeposit.ts.
  useEffect(() => {
    if (!address || !publicClient) return;
    const key = `autodeposit:${address}`;
    const pending = loadPendingTx(key);
    if (!pending) return;

    (async () => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: pending.txHash, timeout: 30_000 });
        if (receipt.status === "success") {
          await refresh();
          setStep("subscribed");
        } else {
          setError("Your previous transaction failed on-chain.");
          setStep("error");
        }
      } catch {
        // Still pending — leave it, the next visit will re-check.
      } finally {
        clearPendingTx(key);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient]);

  async function subscribe(monthlyAmount: bigint, approvalCycles: number = DEFAULT_APPROVAL_CYCLES) {
    const addrError = assertValidAddresses();
    if (addrError) {
      setError(addrError);
      setStep("error");
      return;
    }
    if (!walletClient || !address || !publicClient || !AUTO_DEPOSIT_ROUTER) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setStep("checking");

    try {
      const currentAllowance = await publicClient.readContract({
        address: CUSD,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, AUTO_DEPOSIT_ROUTER],
      });

      const desiredAllowance = monthlyAmount * BigInt(approvalCycles);

      if (currentAllowance !== desiredAllowance) {
        setStep("approving");
        if (currentAllowance > 0n) {
          // Defensively reset to 0 before setting a new value — some ERC20s
          // revert on approve() when the current allowance is already
          // nonzero and the new value differs. Same pattern as useDeposit.ts.
          const resetHash = await sendCip64Transaction(walletClient, {
            account: address,
            to: CUSD,
            data: encodeApprove(AUTO_DEPOSIT_ROUTER, 0n),
            // cUSD is natively whitelisted as a CIP-64 feeCurrency.
            feeCurrency: CUSD,
          });
          await publicClient.waitForTransactionReceipt({ hash: resetHash });
        }
        const approveHash = await sendCip64Transaction(walletClient, {
          account: address,
          to: CUSD,
          data: encodeApprove(AUTO_DEPOSIT_ROUTER, desiredAllowance),
          feeCurrency: CUSD,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep("setting_plan");
      const setPlanHash = await sendCip64Transaction(walletClient, {
        account: address,
        to: AUTO_DEPOSIT_ROUTER,
        data: encodeSetPlan(monthlyAmount, DEFAULT_INTERVAL_SECONDS),
        feeCurrency: CUSD,
      });
      const pendingKey = `autodeposit:${address}`;
      savePendingTx(pendingKey, { txHash: setPlanHash });
      await publicClient.waitForTransactionReceipt({ hash: setPlanHash });
      clearPendingTx(pendingKey);

      await refresh();
      setStep("subscribed");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
      setStep("error");
    }
  }

  async function cancel() {
    if (!walletClient || !address || !publicClient || !AUTO_DEPOSIT_ROUTER) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setStep("cancelling");

    try {
      const cancelHash = await sendCip64Transaction(walletClient, {
        account: address,
        to: AUTO_DEPOSIT_ROUTER,
        data: encodeCancelPlan(),
        feeCurrency: CUSD,
      });
      await publicClient.waitForTransactionReceipt({ hash: cancelHash });

      // Revoking the allowance is a separate, direct call — the router has
      // no permission to change a user's ERC20 allowance on their behalf.
      // See cancelPlan()'s doc comment in CeloSaveAutoDepositRouter.sol.
      // Still fully self-service: two wallet-signed transactions, no
      // backend step, same as the old cancel + unwrap flow this replaced.
      const revokeHash = await sendCip64Transaction(walletClient, {
        account: address,
        to: CUSD,
        data: encodeApprove(AUTO_DEPOSIT_ROUTER, 0n),
        feeCurrency: CUSD,
      });
      await publicClient.waitForTransactionReceipt({ hash: revokeHash });

      await refresh();
      setStep("cancelled");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
      setStep("error");
    }
  }

  // The contract's depositFor is permissionless by design — a user can
  // trigger their own eligible cycle immediately rather than waiting for
  // the backend keeper's next pass. Only meaningful once `isEligibleNow`.
  async function depositNow() {
    if (!walletClient || !address || !publicClient || !AUTO_DEPOSIT_ROUTER || !plan) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setStep("depositing");

    try {
      const depositHash = await sendCip64Transaction(walletClient, {
        account: address,
        to: AUTO_DEPOSIT_ROUTER,
        data: encodeDepositFor(address, plan.monthlyAmount),
        feeCurrency: CUSD,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      await refresh();
      setStep("deposited");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingCycles = plan ? cyclesRemaining(allowance, plan.monthlyAmount) : 0;
  const isEligibleNow = plan !== null && plan.active && plan.nextExecutionTime <= nowSeconds;
  const lowAllowanceWarning = plan !== null && plan.active && remainingCycles <= LOW_ALLOWANCE_WARNING_CYCLES;

  return {
    step,
    error,
    plan,
    allowance,
    remainingCycles,
    lowAllowanceWarning,
    isEligibleNow,
    subscribe,
    cancel,
    depositNow,
    reset,
    refresh,
  };
}
