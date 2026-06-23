"use client";

import { useReadContract, useAccount } from "wagmi";
import { celo } from "wagmi/chains";
import { aaveDataProviderAbi, erc20Abi } from "@/lib/abis";
import { AAVE_DATA_PROVIDER, getTokenContracts, type SupportedToken } from "@/lib/contracts";
import { liquidityRateToAPY } from "@/lib/aave-utils";

// All reads are pinned to Celo mainnet so they work regardless of
// which network the connected wallet reports.

export function useAaveAPY(token: SupportedToken = "USDT") {
  const { token: tokenAddress } = getTokenContracts(token);

  const { data, isLoading } = useReadContract({
    address: AAVE_DATA_PROVIDER,
    abi: aaveDataProviderAbi,
    functionName: "getReserveData",
    args: [tokenAddress],
    chainId: celo.id,
  });

  const apy = data ? liquidityRateToAPY(data[5]) : null;
  return { apy, isLoading };
}

export function useATokenBalance(token: SupportedToken = "USDT") {
  const { address } = useAccount();
  const { aToken } = getTokenContracts(token);

  const { data: balance, isLoading, refetch } = useReadContract({
    address: aToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  return { balance: balance ?? 0n, isLoading, refetch };
}

export function useTokenBalance(token: SupportedToken = "USDT") {
  const { address } = useAccount();
  const { token: tokenAddress } = getTokenContracts(token);

  const { data: balance, isLoading, refetch } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: celo.id,
    query: { enabled: !!address },
  });

  return { balance: balance ?? 0n, isLoading, refetch };
}
