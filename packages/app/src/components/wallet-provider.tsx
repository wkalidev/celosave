"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WagmiProvider, createConfig, http, useConnect } from "wagmi";
import { celo, celoSepolia } from "wagmi/chains";

// Deliberately NOT importing RainbowKitProvider or its stylesheet here.
// Wagmi's hooks (useConnect, useAccount, etc. — used throughout the app,
// including MiniPay's auto-connect below) only need WagmiProvider's
// context; RainbowKitProvider is purely for RainbowKit's own UI (the
// connect modal, wallet icons, WalletConnect QR flow), consumed only by
// RainbowKit's <ConnectButton>. That component and its provider are now
// scoped together and lazy-loaded in connect-button.tsx /
// connect-button-lazy.tsx instead of wrapping the whole app here — see
// those files for why (PageSpeed LCP fix: this stylesheet + modal JS was
// previously render-blocking on every page for every visitor, including
// the MiniPay majority who never see it).
//
// connectorsForWallets/injectedWallet are just connector factories (no
// modal UI, no stylesheet) and stay eager here since wagmiConfig needs
// `connectors` synchronously at module scope, before any component mounts.

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [injectedWallet],
    },
  ],
  {
    appName: "CeloSave",
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "",
  }
);

const wagmiConfig = createConfig({
  chains: [celo, celoSepolia],
  connectors,
  transports: {
    [celo.id]: http(process.env.NEXT_PUBLIC_CELO_RPC_URL),
    [celoSepolia.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

function WalletProviderInner({ children }: { children: React.ReactNode }) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    // Auto-connect when running inside MiniPay
    if (
      typeof window !== "undefined" &&
      window.ethereum &&
      (window.ethereum as any).isMiniPay
    ) {
      const injected = connectors.find((c) => c.id === "injected");
      if (injected) {
        connect({ connector: injected });
      }
    }
  }, [connect, connectors]);

  return <>{children}</>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mounted && <WalletProviderInner>{children}</WalletProviderInner>}
        {!mounted && children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
