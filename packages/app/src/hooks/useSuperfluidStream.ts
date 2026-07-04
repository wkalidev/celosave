"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useReadContract } from "wagmi";
import { celo } from "wagmi/chains";
import {
  SF_CFA_FORWARDER,
  SF_SUPER_TOKEN_FACTORY,
  USDC,
  USDC_FEE_ADAPTER,
  TREASURY,
} from "@/lib/contracts";
import {
  cfaForwarderAbi,
  superTokenFactoryAbi,
  superTokenAbi,
  monthlyToFlowRate,
  flowRateToMonthly,
  formatUsdc,
} from "@/lib/sf-abis";
import { erc20Abi } from "@/lib/abis";
import { toFriendlyError } from "@/lib/error-utils";

export type StreamStep =
  | "idle"
  | "checking"
  | "deploying_wrapper"
  | "approving_usdc"
  | "wrapping"
  | "creating_flow"
  | "success"
  | "cancelling"
  | "cancelled"
  | "error";

export interface StreamInfo {
  flowRate: bigint;         // raw per-second int96
  monthlyUsdc: bigint;      // computed from flowRate
  monthlyDisplay: string;   // "$X.XX"
  deposit: bigint;
  isActive: boolean;
}

export interface UsdcxState {
  address: `0x${string}` | null;
  isDeployed: boolean;
}

const MAX_UINT256 = 2n ** 256n - 1n;

export function useSuperfluidStream() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  const [step, setStep] = useState<StreamStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usdcx, setUsdcx] = useState<UsdcxState>({ address: null, isDeployed: false });
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);

  // Read the canonical USDCx address (deterministic even before deployment)
  const { data: wrapperData, refetch: refetchWrapper } = useReadContract({
    address: SF_SUPER_TOKEN_FACTORY,
    abi: superTokenFactoryAbi,
    functionName: "computeCanonicalERC20WrapperAddress",
    args: [USDC],
    chainId: celo.id,
  });

  useEffect(() => {
    if (wrapperData) {
      const [addr, deployed] = wrapperData;
      setUsdcx({ address: addr, isDeployed: deployed });
    }
  }, [wrapperData]);

  // Read active flow from user to treasury
  const { data: flowData, refetch: refetchFlow } = useReadContract({
    address: SF_CFA_FORWARDER,
    abi: cfaForwarderAbi,
    functionName: "getFlowInfo",
    args: [usdcx.address ?? "0x0000000000000000000000000000000000000000", address ?? "0x0000000000000000000000000000000000000000", TREASURY],
    chainId: celo.id,
    query: { enabled: !!usdcx.address && !!address },
  });

  useEffect(() => {
    if (flowData) {
      const [, flowRate, deposit] = flowData;
      const rate = BigInt(flowRate);
      const isActive = rate > 0n;
      setStreamInfo({
        flowRate: rate,
        monthlyUsdc: isActive ? flowRateToMonthly(rate) : 0n,
        monthlyDisplay: isActive ? formatUsdc(flowRateToMonthly(rate)) : "$0",
        deposit,
        isActive,
      });
    }
  }, [flowData]);

  // Live balance hook: poll every 3s when stream is active
  const [liveBalance, setLiveBalance] = useState<string>("$0.00");
  useEffect(() => {
    if (!streamInfo?.isActive || !usdcx.address || !address || !publicClient) return;
    const poll = async () => {
      try {
        const result = await publicClient.readContract({
          address: usdcx.address!,
          abi: superTokenAbi,
          functionName: "realtimeBalanceOf",
          args: [address, BigInt(Math.floor(Date.now() / 1000))],
        });
        const available = result[0];
        setLiveBalance(available >= 0n ? formatUsdc(available) : "$0.00");
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [streamInfo?.isActive, usdcx.address, address, publicClient]);

  async function subscribe(monthlyUsdcRaw: bigint) {
    if (!walletClient || !address || !publicClient) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    const flowRate = monthlyToFlowRate(monthlyUsdcRaw);
    if (flowRate <= 0n) {
      setError("Amount too small — minimum ~$2.60/month");
      return;
    }

    // Amount to wrap: 2 months buffer
    const wrapAmount = monthlyUsdcRaw * 2n;

    try {
      // Step 1: Deploy wrapper if needed
      if (!usdcx.isDeployed) {
        setStep("deploying_wrapper");
        const deployTx = await walletClient.sendTransaction({
          account: address,
          to: SF_SUPER_TOKEN_FACTORY,
          chain: celo,
          data: encodeDeploy(),
          // @ts-ignore — CIP-64
          feeCurrency: USDC_FEE_ADAPTER,
        });
        await publicClient.waitForTransactionReceipt({ hash: deployTx });
        await refetchWrapper();
        // After deploy, wrapperData updates via effect; need to re-read
        const newWrapper = await publicClient.readContract({
          address: SF_SUPER_TOKEN_FACTORY,
          abi: superTokenFactoryAbi,
          functionName: "computeCanonicalERC20WrapperAddress",
          args: [USDC],
        });
        setUsdcx({ address: newWrapper[0], isDeployed: true });
      }

      const usdcxAddr = usdcx.address ?? (await getUsdcxAddress(publicClient));

      // Step 2: Approve USDC to USDCx contract
      setStep("approving_usdc");
      const approveTx = await walletClient.sendTransaction({
        account: address,
        to: USDC,
        chain: celo,
        data: encodeApprove(usdcxAddr, wrapAmount),
        // @ts-ignore — CIP-64
        feeCurrency: USDC_FEE_ADAPTER,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      // Step 3: Wrap USDC → USDCx
      setStep("wrapping");
      const upgradeTx = await walletClient.sendTransaction({
        account: address,
        to: usdcxAddr,
        chain: celo,
        data: encodeUpgrade(wrapAmount),
        // @ts-ignore — CIP-64
        feeCurrency: USDC_FEE_ADAPTER,
      });
      await publicClient.waitForTransactionReceipt({ hash: upgradeTx });

      // Step 4: Create Superfluid flow to treasury
      setStep("creating_flow");
      const flowTx = await walletClient.sendTransaction({
        account: address,
        to: SF_CFA_FORWARDER,
        chain: celo,
        data: encodeCreateFlow(usdcxAddr, address, TREASURY, flowRate),
        // @ts-ignore — CIP-64
        feeCurrency: USDC_FEE_ADAPTER,
      });
      await publicClient.waitForTransactionReceipt({ hash: flowTx });

      await refetchFlow();
      setStep("success");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
      setStep("error");
    }
  }

  async function cancelSubscription() {
    if (!walletClient || !address || !publicClient || !usdcx.address) return;
    setStep("cancelling");
    setError(null);
    try {
      const deleteTx = await walletClient.sendTransaction({
        account: address,
        to: SF_CFA_FORWARDER,
        chain: celo,
        data: encodeDeleteFlow(usdcx.address, address, TREASURY),
        // @ts-ignore — CIP-64
        feeCurrency: USDC_FEE_ADAPTER,
      });
      await publicClient.waitForTransactionReceipt({ hash: deleteTx });
      await refetchFlow();
      setStep("cancelled");
    } catch (e: unknown) {
      setError(toFriendlyError(e));
      setStep("error");
    }
  }

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  return {
    step,
    error,
    usdcx,
    streamInfo,
    liveBalance,
    subscribe,
    cancelSubscription,
    reset,
  };
}

// --- ABI encoding helpers (avoid importing full viem encodeFunctionData in hook) ---

import { encodeFunctionData } from "viem";

function encodeDeploy(): `0x${string}` {
  return encodeFunctionData({
    abi: superTokenFactoryAbi,
    functionName: "deployCanonicalERC20Wrapper",
    args: [USDC],
  });
}

function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

function encodeUpgrade(amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: superTokenAbi,
    functionName: "upgrade",
    args: [amount],
  });
}

function encodeCreateFlow(
  token: `0x${string}`,
  sender: `0x${string}`,
  receiver: `0x${string}`,
  flowRate: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: cfaForwarderAbi,
    functionName: "createFlow",
    args: [token, sender, receiver, flowRate, "0x"],
  });
}

function encodeDeleteFlow(
  token: `0x${string}`,
  sender: `0x${string}`,
  receiver: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: cfaForwarderAbi,
    functionName: "deleteFlow",
    args: [token, sender, receiver, "0x"],
  });
}

async function getUsdcxAddress(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
): Promise<`0x${string}`> {
  const [addr] = await publicClient.readContract({
    address: SF_SUPER_TOKEN_FACTORY,
    abi: superTokenFactoryAbi,
    functionName: "computeCanonicalERC20WrapperAddress",
    args: [USDC],
  });
  return addr;
}
