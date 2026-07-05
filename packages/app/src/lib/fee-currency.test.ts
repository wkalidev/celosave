import { describe, it, expect } from "vitest";
import { isAddress, type PublicClient } from "viem";
import { pickFeeCurrency } from "./fee-currency";
import { CUSD, USDT, USDC, USDT_FEE_ADAPTER, USDC_FEE_ADAPTER } from "./contracts";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

function mockClient(balances: Partial<Record<string, bigint>>, celoBalance: bigint): PublicClient {
  return {
    readContract: async ({ address }: { address: string }) => balances[address.toLowerCase()] ?? 0n,
    getBalance: async () => celoBalance,
  } as unknown as PublicClient;
}

// Regression test for a real incident: CUSD was once a 39-hex-digit address
// (one character short of valid, a truncated copy-paste), which made every
// withdrawal crash before its actual transaction because this was the first
// candidate checked and nothing caught the error. Assert every candidate
// address this module can pick is well-formed, so a future typo fails a
// test instead of production.
describe("fee-currency candidate addresses", () => {
  it("CUSD is a well-formed 20-byte address", () => {
    expect(isAddress(CUSD, { strict: false })).toBe(true);
  });

  it("all token and adapter addresses used by pickFeeCurrency are well-formed", () => {
    for (const addr of [CUSD, USDT, USDC, USDT_FEE_ADAPTER, USDC_FEE_ADAPTER]) {
      expect(isAddress(addr, { strict: false })).toBe(true);
    }
  });
});

describe("pickFeeCurrency", () => {
  it("prefers cUSD when the wallet holds enough", async () => {
    const client = mockClient({ [CUSD.toLowerCase()]: 50_000n }, 0n);
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toEqual({ feeCurrency: CUSD, label: "cUSD" });
  });

  it("falls back to USDT when cUSD balance is too low", async () => {
    const client = mockClient(
      { [CUSD.toLowerCase()]: 0n, [USDT.toLowerCase()]: 50_000n },
      0n
    );
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toEqual({ feeCurrency: USDT_FEE_ADAPTER, label: "USDT" });
  });

  it("falls back to USDC when cUSD and USDT are both too low", async () => {
    const client = mockClient(
      { [CUSD.toLowerCase()]: 0n, [USDT.toLowerCase()]: 0n, [USDC.toLowerCase()]: 50_000n },
      0n
    );
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toEqual({ feeCurrency: USDC_FEE_ADAPTER, label: "USDC" });
  });

  it("falls back to native CELO as a last resort", async () => {
    const client = mockClient({}, 10n ** 16n);
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toEqual({ feeCurrency: undefined, label: "CELO" });
  });

  it("returns null when no currency has enough balance — this is the bug this fix closes: withdrawing the full balance of a token used to always leave the wallet unable to pay its own gas", async () => {
    const client = mockClient({}, 0n);
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toBeNull();
  });

  it("treats dust below the floor as insufficient", async () => {
    const client = mockClient({ [CUSD.toLowerCase()]: 1n }, 1n);
    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toBeNull();
  });

  it("falls through to the next candidate if a balance check throws, instead of crashing the whole picker", async () => {
    const client = {
      readContract: async ({ address }: { address: string }) => {
        if (address.toLowerCase() === CUSD.toLowerCase()) {
          throw new Error('Address "..." is invalid.');
        }
        return address.toLowerCase() === USDT.toLowerCase() ? 50_000n : 0n;
      },
      getBalance: async () => 0n,
    } as unknown as PublicClient;

    const choice = await pickFeeCurrency(client, ADDRESS);
    expect(choice).toEqual({ feeCurrency: USDT_FEE_ADAPTER, label: "USDT" });
  });
});
