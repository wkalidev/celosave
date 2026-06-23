"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { celo } from "wagmi/chains";
import { aaveDataProviderAbi, erc20Abi } from "@/lib/abis";
import { AAVE_DATA_PROVIDER, USDT, USDT_A_TOKEN } from "@/lib/contracts";
import { liquidityRateToAPY } from "@/lib/aave-utils";

// All reads are pinned to Celo mainnet (chainId 42220) so they work even if
// the connected wallet is on a different network.

export function useAaveAPY() {
  const { data, isLoading } = useReadContract({
    address: AAVE_DATA_PROVIDER,
    abi: aaveDataProviderAbi,
    functionName: "getReserveData",
    args: [USDT],
    chainId: celo.id,
  });

  const apy = data ? liquidityRateToAPY(data[5]) : null;

  return { apy, isLoading };
}

export function useATokenBalance() {
  const { address } = useAccount();

  const { data: balance, isLoading, refetch } = useReadContract({
    address: USDT_A_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  return { balance: balance ?? 0n, isLoading, refetch };
}

export function useUsdtBalance() {
  const { address } = useAccount();

  const { data: balance, isLoading, refetch } = useReadContract({
    address: USDT,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  return { balance: balance ?? 0n, isLoading, refetch };
}

export function useUsdtAllowance() {
  const { address } = useAccount();

  const { data: allowance, refetch } = useReadContract({
    address: USDT,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      AAVE_DATA_PROVIDER,
    ],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  return { allowance: allowance ?? 0n, refetch };
}
