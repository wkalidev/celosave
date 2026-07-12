"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// The real RainbowKit modal (ConnectButton + RainbowKitProvider + its
// stylesheet) lives in its own chunk, loaded client-side only, and only for
// the non-MiniPay visitors who can ever see it — see connect-button-lazy.tsx.
// This used to be loaded eagerly for every visitor via the root layout's
// WalletProvider: a render-blocking stylesheet plus the WalletConnect modal
// JS, on every page including the landing/Save page, whether or not the
// visitor was in MiniPay (the majority of real traffic, which never shows
// this button at all). PageSpeed flagged that as part of the
// render-blocking-requests and unused-JavaScript findings dragging LCP to
// 3.9s. Deferring it here means MiniPay visitors typically never fetch this
// chunk, and non-MiniPay visitors fetch it in the background after first
// paint instead of before it.
const ConnectButtonLazy = dynamic(() => import("./connect-button-lazy"), {
  ssr: false,
});

export function ConnectButton() {
  const [isMiniPay, setIsMiniPay] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.ethereum as any)?.isMiniPay
    ) {
      setIsMiniPay(true);
    }
  }, []);

  // Hide connect button when inside MiniPay — wallet auto-connects, and we
  // never render (so never fetch) the RainbowKit chunk in that case. Note:
  // on the very first render `isMiniPay` is still `false` (see the
  // useEffect above — reading `window` synchronously during render would
  // cause a server/client hydration mismatch), so a MiniPay visitor can
  // still trigger one wasted background fetch of the lazy chunk before this
  // flips to `true` a moment later. That's a background network request
  // that never renders anything, not a visible regression — eliminating it
  // completely would need a blocking inline script in <head> to detect
  // MiniPay before hydration, which is more complexity than this is worth.
  if (isMiniPay) return null;

  return <ConnectButtonLazy />;
}
