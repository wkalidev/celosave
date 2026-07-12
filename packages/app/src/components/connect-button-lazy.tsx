"use client";

import {
  RainbowKitProvider,
  ConnectButton as RainbowKitConnectButton,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

// The actual RainbowKit modal UI (wallet list, WalletConnect QR flow) plus
// its stylesheet, split into its own chunk — see the next/dynamic() call in
// connect-button.tsx for why. RainbowKitProvider only needs to be an
// ancestor of the RainbowKit components it wraps, not the whole app, and it
// only needs WagmiProvider as its own ancestor, which wallet-provider.tsx
// still provides eagerly at the root — so scoping it down to just this
// component is safe.
//
// Custom accentColor/accentColorForeground: RainbowKit's default theme uses
// its own blue (#0E76FD) as the "Connect Wallet" button background with
// white text — that pair is only ~4.18:1, failing WCAG AA's 4.5:1 for normal
// text (confirmed against dist/components/ConnectButton/ConnectButton.css,
// which applies accentColor/accentColorForeground as this button's
// background/text). Reusing the app's own primary-dark (#065F3F, already
// verified elsewhere at ~7.7:1 against white/near-white) both fixes the
// contrast failure and puts the button on-brand instead of RainbowKit's
// default blue.
const theme = lightTheme({
  accentColor: "#065F3F",
  accentColorForeground: "#FFFFFF",
});

export default function ConnectButtonLazy() {
  return (
    <RainbowKitProvider theme={theme}>
      <RainbowKitConnectButton />
    </RainbowKitProvider>
  );
}
