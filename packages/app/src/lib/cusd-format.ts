// cUSD amount formatting/parsing — 18 decimals (not 6 like USDT/USDC). Kept
// separate from the app-wide DECIMALS constant in contracts.ts, which the
// USDT/USDC Aave savings flow still relies on.
//
// Formerly lived in sf-abis.ts alongside Superfluid-specific flow-rate math
// (monthlyToFlowRate/flowRateToMonthly) and ABIs (cfaForwarderAbi/
// superTokenAbi). Auto-Save no longer uses Superfluid at all — it's now a
// non-custodial allowance + on-chain plan (see
// packages/contracts/src/CeloSaveAutoDepositRouter.sol) — so those
// Superfluid-only exports were removed rather than carried forward. This
// file keeps only the decimal-formatting helpers, which are still needed
// because cUSD itself (18 decimals) is still the asset being moved.
export const CUSD_DECIMALS = 18;

// Format an 18-decimal raw cUSD amount as a "$X.XX" display string.
export function formatCusd(raw: bigint, precision = 2): string {
  if (raw <= 0n) return "$0.00";
  const str = raw.toString().padStart(CUSD_DECIMALS + 1, "0");
  const dollars = str.slice(0, -CUSD_DECIMALS) || "0";
  const frac = str.slice(-CUSD_DECIMALS).slice(0, precision);
  return `$${dollars}.${frac}`;
}

// Parse a user-typed decimal string (e.g. "12.5") into an 18-decimal raw
// cUSD amount. Returns 0n for empty/invalid input instead of throwing, so
// callers can treat it the same as "no amount entered" everywhere.
export function parseCusd(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return 0n;
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw || "0";
  const frac = fracRaw.slice(0, CUSD_DECIMALS).padEnd(CUSD_DECIMALS, "0");
  try {
    return BigInt(whole) * 10n ** BigInt(CUSD_DECIMALS) + BigInt(frac || "0");
  } catch {
    return 0n;
  }
}
