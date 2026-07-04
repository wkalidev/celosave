import { isAddress } from "viem";

// Guards against sending funds to a malformed/invalid address returned by
// the backend (bug, misconfiguration, or a compromised response) before it
// ever reaches encodeFunctionData / sendTransaction.
//
// Uses loose (non-checksummed) validation deliberately: Celo/Ethereum
// addresses are case-insensitive on-chain, EIP-55 checksum casing is only a
// client-side typo-detection convention, and this codebase's own TREASURY
// constant does not pass strict EIP-55 validation despite being a correct,
// currently-in-production address. Strict mode would reject real, valid
// treasury payments — this only needs to catch actually malformed input
// (wrong length, non-hex characters, missing 0x prefix).
export function assertValidPaymentAddress(address: string): asserts address is `0x${string}` {
  if (!isAddress(address, { strict: false })) {
    throw new Error("Received an invalid address from the server. Payment aborted for your safety.");
  }
}
