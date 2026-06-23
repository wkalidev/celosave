import { DECIMALS } from "./contracts";

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

// Convert Aave's RAY-scaled liquidityRate to a human-readable APY percentage
export function liquidityRateToAPY(liquidityRate: bigint): number {
  const apr = Number(liquidityRate) / Number(RAY);
  // Exact compound formula matching Aave's UI
  const apy = (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
  return apy;
}

// Format a raw token amount (6 decimals) to a display string
export function formatUnits(amount: bigint, decimals = DECIMALS): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}

// Parse a display string to raw token amount (6 decimals)
export function parseTokenAmount(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.slice(0, DECIMALS).padEnd(DECIMALS, "0");
  return BigInt(whole || "0") * 10n ** BigInt(DECIMALS) + BigInt(fracPadded);
}

