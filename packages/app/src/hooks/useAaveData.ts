"use client";

import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { aaveDataProviderAbi, erc20Abi } from "@/lib/abis";
import { AAVE_DATA_PROVIDER, AAVE_POOL, USDT, USDT_A_TOKEN } from "@/lib/contracts";
import { liquidityRateToAPY } from "@/lib/aave-utils";

export function useAaveAPY() {
  const { data, isLoading } = useReadContract({
    address: AAVE_DATA_PROVIDER,
    abi: aaveDataProviderAbi,
    functionName: "getReserveData",
    args: [USDT],
  });

  // data is a tuple; index 5 = liquidityRate (see aaveDataProviderAbi outputs)
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
      AAVE_POOL,
    ],
    query: { enabled: !!address },
  });

  return { allowance: allowance ?? 0n, refetch };
}
