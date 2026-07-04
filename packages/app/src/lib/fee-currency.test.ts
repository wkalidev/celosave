import { describe, it, expect } from "vitest";
import type { PublicClient } from "viem";
import { pickFeeCurrency } from "./fee-currency";
import { CUSD, USDT, USDC, USDT_FEE_ADAPTER, USDC_FEE_ADAPTER } from "./contracts";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

function mockClient(balances: Partial<Record<string, bigint>>, celoBalance: bigint): PublicClient {
  return {
    readContract: async ({ address }: { address: string }) => balances[address.toLowerCase()] ?? 0n,
    getBalance: async () => celoBalance,
  } as unknown as PublicClient;
}

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
});
