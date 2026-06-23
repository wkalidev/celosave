"use client";

// Tracks deposited principal per wallet+token in localStorage.
// Needed to calculate yield = aTokenBalance - principal for fee collection.
// Key: celosave_principal_<chainId>_<address>_<symbol>
// Value: bigint serialized as decimal string

const prefix = (chainId: number, address: string, symbol: string) =>
  `celosave_principal_${chainId}_${address.toLowerCase()}_${symbol}`;

export function getPrincipal(
  chainId: number,
  address: string,
  symbol: string
): bigint {
  if (typeof window === "undefined") return 0n;
  const raw = localStorage.getItem(prefix(chainId, address, symbol));
  return raw ? BigInt(raw) : 0n;
}

export function addDeposit(
  chainId: number,
  address: string,
  symbol: string,
  amount: bigint
): void {
  const current = getPrincipal(chainId, address, symbol);
  localStorage.setItem(
    prefix(chainId, address, symbol),
    (current + amount).toString()
  );
}

export function clearPrincipal(
  chainId: number,
  address: string,
  symbol: string
): void {
  localStorage.removeItem(prefix(chainId, address, symbol));
}

export function reducePrincipal(
  chainId: number,
  address: string,
  symbol: string,
  aTokenBalance: bigint,
  withdrawAmount: bigint
): void {
  const principal = getPrincipal(chainId, address, symbol);
  if (principal === 0n || aTokenBalance === 0n) return;
  // Reduce principal proportionally to the withdrawal
  const principalWithdrawn = (principal * withdrawAmount) / aTokenBalance;
  const remaining = principal > principalWithdrawn ? principal - principalWithdrawn : 0n;
  localStorage.setItem(prefix(chainId, address, symbol), remaining.toString());
}
