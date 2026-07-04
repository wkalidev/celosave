import type { PublicClient } from "viem";
import { erc20Abi } from "./abis";
import { CUSD, USDT, USDC, USDT_FEE_ADAPTER, USDC_FEE_ADAPTER } from "./contracts";

// Heuristic floors, not an exact gas estimate — ruling out the common
// "balance is exactly 0" case that always fails is most of the value here.
// A transaction can still fail if the true cost exceeds these.
const MIN_STABLE_RAW = 10_000n; // ~$0.01 of a 6-decimal stablecoin
const MIN_CELO_WEI = 10n ** 15n; // ~0.001 CELO

export interface FeeCurrencyChoice {
  feeCurrency: `0x${string}` | undefined; // undefined = pay in native CELO
  label: string;
}

const STABLE_CANDIDATES: Array<{ token: `0x${string}`; adapter: `0x${string}`; label: string }> = [
  { token: CUSD, adapter: CUSD, label: "cUSD" },
  { token: USDT, adapter: USDT_FEE_ADAPTER, label: "USDT" },
  { token: USDC, adapter: USDC_FEE_ADAPTER, label: "USDC" },
];

// Finds a fee currency the wallet can actually pay a transaction with,
// instead of always debiting the same token the user is trying to withdraw
// (whose balance is typically ~0 right before a withdrawal completes).
export async function pickFeeCurrency(
  publicClient: PublicClient,
  address: `0x${string}`
): Promise<FeeCurrencyChoice | null> {
  for (const candidate of STABLE_CANDIDATES) {
    const balance = await publicClient.readContract({
      address: candidate.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance >= MIN_STABLE_RAW) {
      return { feeCurrency: candidate.adapter, label: candidate.label };
    }
  }

  const celoBalance = await publicClient.getBalance({ address });
  if (celoBalance >= MIN_CELO_WEI) {
    return { feeCurrency: undefined, label: "CELO" };
  }

  return null;
}

export const NO_FEE_CURRENCY_MESSAGE =
  "You don't have enough cUSD, USDT, USDC, or CELO in your wallet to pay the network fee for this transaction. Add a small amount of cUSD or CELO to your wallet and try again.";
