"use client";

import { RainbowKitProvider, ConnectButton as RainbowKitConnectButton } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

// The actual RainbowKit modal UI (wallet list, WalletConnect QR flow) plus
// its stylesheet, split into its own chunk — see the next/dynamic() call in
// connect-button.tsx for why. RainbowKitProvider only needs to be an
// ancestor of the RainbowKit components it wraps, not the whole app, and it
// only needs WagmiProvider as its own ancestor, which wallet-provider.tsx
// still provides eagerly at the root — so scoping it down to just this
// component is safe.
export default function ConnectButtonLazy() {
  return (
    <RainbowKitProvider>
      <RainbowKitConnectButton />
    </RainbowKitProvider>
  );
}
