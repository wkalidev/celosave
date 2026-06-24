"use client";

import { useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { celo } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { REGISTRY, USDT_FEE_ADAPTER, registryAbi } from "@/lib/contracts";

// Called once per wallet address, ever. Fires in the background on first connection.
// Emits UserRegistered on the CeloSaveRegistry contract — trackable by Talent/Proof of Ship.
export function useRegistration() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

  useEffect(() => {
    if (!isConnected || !address || !walletClient || !publicClient) return;

    const storageKey = `celosave:registered:${address.toLowerCase()}`;
    if (localStorage.getItem(storageKey)) return;

    (async () => {
      try {
        const hash = await walletClient.sendTransaction({
          account: address,
          to: REGISTRY,
          data: encodeFunctionData({ abi: registryAbi, functionName: "register" }),
          // @ts-ignore — CIP-64: pay gas in USDT inside MiniPay; ignored by browser wallets
          feeCurrency: USDT_FEE_ADAPTER,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        localStorage.setItem(storageKey, "1");
      } catch {
        // Silently swallow — retry on next connection if gas is unavailable
      }
    })();
  }, [isConnected, address, walletClient, publicClient]);
}
