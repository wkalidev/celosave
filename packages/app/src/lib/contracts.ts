// All addresses verified on celoscan.io before use in production

// Source: docs.celo.org/build-with-ai/x402
export const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e" as const;
export const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;

// Source: docs.celo.org/fee-abstraction
export const USDT_FEE_ADAPTER = "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as const;
export const USDC_FEE_ADAPTER = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B" as const;

// Source: bgd-labs/aave-address-book AaveV3Celo.ts
export const AAVE_POOL = "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402" as const;
export const AAVE_DATA_PROVIDER = "0x2e0f8D3B1631296cC7c56538D6Eb6032601E15ED" as const;
export const USDT_A_TOKEN = "0xDeE98402A302e4D707fB9bf2bac66fAEEc31e8Df" as const;
export const USDC_A_TOKEN = "0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785" as const;

// Protocol treasury — receives 0.30% yield fee on withdrawals
export const TREASURY = "0x3AC95343494979d0c92195D387D278DCB3d6d595" as const;

// USDT and USDC both use 6 decimals on Celo (not 18)
export const DECIMALS = 6;

// 0.30% protocol fee on yield portion only
export const PROTOCOL_FEE_BPS = 30n;
export const BPS_DENOMINATOR = 10000n;
