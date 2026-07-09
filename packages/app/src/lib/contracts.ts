// All addresses verified on celoscan.io before use in production

// Source: docs.celo.org/build-with-ai/x402
export const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e" as const;
export const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;

// Source: docs.celo.org/fee-abstraction
export const USDT_FEE_ADAPTER = "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as const;
export const USDC_FEE_ADAPTER = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B" as const;

// cUSD — Celo's original native stablecoin. Natively whitelisted as a fee
// currency since before CIP-64, so the token address itself is used directly
// as `feeCurrency` (no separate adapter contract needed, unlike USDT/USDC).
// Source: docs.celo.org/build-with-ai/fee-abstraction — verify on celoscan.io.
export const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;

// Source: bgd-labs/aave-address-book AaveV3Celo.ts
export const AAVE_POOL = "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402" as const;
export const AAVE_DATA_PROVIDER = "0x2e0f8D3B1631296cC7c56538D6Eb6032601E15ED" as const;
export const USDT_A_TOKEN = "0xDeE98402A302e4D707fB9bf2bac66fAEEc31e8Df" as const;
export const USDC_A_TOKEN = "0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785" as const;

// The official Aave V3 Celo PoolAddressesProvider — the router contract
// (packages/contracts/src/CeloSaveAutoDepositRouter.sol) resolves AAVE_POOL
// from this address at deploy time rather than trusting a hardcoded Pool
// address directly, matching Aave's own recommended integration pattern.
// Source: bgd-labs/aave-address-book AaveV3Celo.ts (POOL_ADDRESSES_PROVIDER).
export const AAVE_POOL_ADDRESSES_PROVIDER = "0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5" as const;

// aCelcUSD — the Aave V3 Celo aToken for cUSD. Confirmed live on-chain via
// Blockscout: named "Aave Celo cUSD", 18 decimals, 663 holders and ~504k
// tokens in circulation at time of verification (i.e. supply() has already
// succeeded on this exact reserve hundreds of times) — not a dead/unlisted
// market. Note: bgd-labs/aave-address-book labels this reserve's ASSETS key
// "USDm" (an internal/legacy codename), but its UNDERLYING address is
// byte-identical to CUSD above — this aToken address is the one that
// actually matters, sourced from that same UNDERLYING cross-reference.
// Source: bgd-labs/aave-address-book AaveV3Celo.ts (ASSETS.USDm.A_TOKEN),
// cross-verified against celo.blockscout.com.
export const CUSD_A_TOKEN = "0xBba98352628B0B0c4b40583F593fFCb630935a45" as const;

// Protocol treasury — receives subscription streams and bill-pay markup.
// Recased to its correct EIP-55 checksum (was 0x...DCB3d6d595, one wrong
// case on the "B" before "3d6d595" — same address bytes, same account,
// verified case-insensitively equal to the original). The old casing failed
// viem's strict address validation, which viem's own encodeFunctionData
// enforces unconditionally for `address`-typed ABI params — every
// Superfluid createFlow/deleteFlow call and every getFlowInfo read in
// useSuperfluidStream.ts passes TREASURY through exactly that path, so the
// old casing would have made Auto-Save throw on its very first transaction.
// address-utils.ts's assertValidPaymentAddress() intentionally uses loose
// (non-checksummed) validation elsewhere in the app specifically because of
// this constant — that workaround stays in place for defense in depth, but
// the actual fix is here: correct the casing at the source so nothing has to
// route around it.
export const TREASURY = "0x3AC95343494979d0c92195D387D278DCb3d6d595" as const;

// CeloSaveRegistry — deployed 2026-06-24 from treasury wallet, tx 0xdf2ea05c655482f9a2adf27d3f91d8f8b05be74a103364e222d0d271f79cd2b4
export const REGISTRY = "0x9213CBE6c3aFf7c1422038d91ECb2362E6907e83" as const;

export const registryAbi = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "isRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "UserRegistered",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// Auto-Save's on-chain router — see
// packages/contracts/src/CeloSaveAutoDepositRouter.sol. Not a hardcoded
// mainnet constant like everything else in this file: it has not been
// deployed yet (see packages/contracts/README.md for the deployment gate —
// the unit test suite and `pnpm verify:aave-reserve` must both pass first).
// Sourced from an env var instead so the app fails obviously (undefined,
// not a wrong/placeholder address) until a real deployed address is wired
// in, rather than shipping a guessed or zero address that would silently
// misbehave.
export const AUTO_DEPOSIT_ROUTER = process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS as
  | `0x${string}`
  | undefined;

// This app no longer uses Superfluid anywhere. Auto-Save was originally
// built on Superfluid CFA v1 streaming (cUSD -> cUSDx -> a per-second flow to
// CeloSave's treasury), but that design was custodial — streamed funds sat
// in a CeloSave-controlled address with no mechanism to actually earn yield
// in the user's name. It was replaced with the non-custodial router above:
// a user grants CeloSaveAutoDepositRouter a capped, revocable cUSD
// allowance and an on-chain monthly plan; anyone can permissionlessly
// trigger a cycle, which supplies straight to Aave V3 `onBehalfOf` the user
// — aTokens land in the user's own wallet, never CeloSave's. The Superfluid
// Host/CFAv1Forwarder/cUSDx constants, sf-abis.ts, and
// scripts/verify-superfluid-addresses.mjs were removed accordingly rather
// than left in as dead code.

// USDT and USDC both use 6 decimals on Celo (not 18)
export const DECIMALS = 6;

export type SupportedToken = "USDT" | "USDC";

export function getTokenContracts(token: SupportedToken) {
  if (token === "USDC") {
    return { token: USDC, aToken: USDC_A_TOKEN, feeAdapter: USDC_FEE_ADAPTER };
  }
  return { token: USDT, aToken: USDT_A_TOKEN, feeAdapter: USDT_FEE_ADAPTER };
}
