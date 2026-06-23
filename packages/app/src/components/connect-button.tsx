"use client";

import { ConnectButton as RainbowKitConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";

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

  // Hide connect button when inside MiniPay — wallet auto-connects
  if (isMiniPay) return null;

  return <RainbowKitConnectButton />;
}
