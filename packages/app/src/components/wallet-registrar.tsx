"use client";

import { useRegistration } from "@/hooks/useRegistration";

// Mounts inside WalletProvider. Silently calls register() on-chain the first
// time each wallet address connects. No UI — purely a background side-effect.
export function WalletRegistrar() {
  useRegistration();
  return null;
}
