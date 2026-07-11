import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb, persist } from "../lib/db";
import { recordKnownUser } from "../lib/keeper-store";

const TEST_DB_PATH = path.join(os.tmpdir(), `celosave-router-keeper-test-${Date.now()}.sqlite`);
const ROUTER_ADDRESS = "0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f";

// router-keeper.ts reads AUTO_DEPOSIT_ROUTER_ADDRESS from process.env at
// module-load time, so it must be set before the module is imported — a
// static top-of-file import would be hoisted ahead of this assignment.
// Same pattern as packages/app/src/hooks/useAutoDeposit.test.ts.
let getEligibleDeposits: typeof import("./router-keeper").getEligibleDeposits;
let triggerDeposit: typeof import("./router-keeper").triggerDeposit;
let checkGasBalance: typeof import("./router-keeper").checkGasBalance;

beforeAll(async () => {
  process.env.AUTO_DEPOSIT_ROUTER_ADDRESS = ROUTER_ADDRESS;
  await initDb(TEST_DB_PATH);
  const mod = await import("./router-keeper");
  getEligibleDeposits = mod.getEligibleDeposits;
  triggerDeposit = mod.triggerDeposit;
  checkGasBalance = mod.checkGasBalance;
});

// getEligibleDeposits reads every row in keeper_known_users, so leaving
// last test's users in place would make later tests' mock clients (which
// only stub the addresses they care about) throw "no mock plan configured"
// for stale addresses — real errors, real withRetry backoff, real risk of
// tripping the test timeout. Start every test with a clean table.
beforeEach(() => {
  getDb().run("DELETE FROM keeper_known_users");
  persist();
});

afterAll(() => {
  closeDb();
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}.tmp`, { force: true });
});

// Minimal hand-rolled mock of the one viem PublicClient method
// getEligibleDeposits actually calls, keyed by the address it's asked
// about — deliberately not a full viem client, same "only mock exactly
// what's used" approach as the Solidity MockAavePool/MockERC20 tests.
function mockPublicClient(planByAddress: Record<string, readonly [bigint, bigint, bigint, boolean]>) {
  return {
    readContract: vi.fn(async ({ args }: { args: readonly [string] }) => {
      const [user] = args;
      const plan = planByAddress[user.toLowerCase()];
      if (!plan) throw new Error(`no mock plan configured for ${user}`);
      return plan;
    }),
  } as unknown as import("viem").PublicClient;
}

describe("getEligibleDeposits", () => {
  it("includes an active plan whose nextExecutionTime has already passed", async () => {
    const user = "0x1111111111111111111111111111111111111d";
    recordKnownUser(user, 1n);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const client = mockPublicClient({
      [user]: [10_000_000_000_000_000_000n, 2_592_000n, nowSeconds - 10n, true],
    });

    const eligible = await getEligibleDeposits(client);
    expect(eligible.some((p) => p.user.toLowerCase() === user)).toBe(true);
  });

  it("excludes a plan whose nextExecutionTime is still in the future", async () => {
    const user = "0x2222222222222222222222222222222222222d";
    recordKnownUser(user, 1n);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const client = mockPublicClient({
      [user]: [10_000_000_000_000_000_000n, 2_592_000n, nowSeconds + 100_000n, true],
    });

    const eligible = await getEligibleDeposits(client);
    expect(eligible.some((p) => p.user.toLowerCase() === user)).toBe(false);
  });

  it("excludes a cancelled (inactive) plan even if its stored nextExecutionTime has passed", async () => {
    const user = "0x3333333333333333333333333333333333333d";
    recordKnownUser(user, 1n);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const client = mockPublicClient({
      [user]: [10_000_000_000_000_000_000n, 2_592_000n, nowSeconds - 10n, false],
    });

    const eligible = await getEligibleDeposits(client);
    expect(eligible.some((p) => p.user.toLowerCase() === user)).toBe(false);
  });

  it("skips a user whose live read fails, without throwing or blocking the rest of the run", async () => {
    const goodUser = "0x4444444444444444444444444444444444444d";
    const badUser = "0x5555555555555555555555555555555555555d";
    recordKnownUser(goodUser, 1n);
    recordKnownUser(badUser, 1n);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    // badUser deliberately has no entry in the mock map, so readContract
    // throws for it — getEligibleDeposits must catch that internally.
    const client = mockPublicClient({
      [goodUser]: [10_000_000_000_000_000_000n, 2_592_000n, nowSeconds - 10n, true],
    });

    const result = await getEligibleDeposits(client);
    expect(result.some((p) => p.user.toLowerCase() === goodUser)).toBe(true);
    expect(result.some((p) => p.user.toLowerCase() === badUser)).toBe(false);
  });
});

describe("triggerDeposit", () => {
  const plan = { user: "0x6666666666666666666666666666666666666d" as `0x${string}`, monthlyAmount: 10_000_000_000_000_000_000n };

  it("returns 'success' and logs it when the receipt status is success", async () => {
    const walletClient = {
      account: { address: "0xkeeper" },
      writeContract: vi.fn().mockResolvedValue("0xTXHASH1"),
    } as unknown as import("viem").WalletClient;
    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    } as unknown as import("viem").PublicClient;

    const outcome = await triggerDeposit(walletClient, publicClient, plan);
    expect(outcome).toBe("success");
  });

  it("returns 'reverted' (not 'error') when the tx is mined but reverts on-chain", async () => {
    const walletClient = {
      account: { address: "0xkeeper" },
      writeContract: vi.fn().mockResolvedValue("0xTXHASH2"),
    } as unknown as import("viem").WalletClient;
    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted" }),
    } as unknown as import("viem").PublicClient;

    const outcome = await triggerDeposit(walletClient, publicClient, plan);
    expect(outcome).toBe("reverted");
  });

  it("returns 'error' when submitting the transaction itself throws", async () => {
    const walletClient = {
      account: { address: "0xkeeper" },
      writeContract: vi.fn().mockRejectedValue(new Error("network error")),
    } as unknown as import("viem").WalletClient;
    const publicClient = {
      waitForTransactionReceipt: vi.fn(),
    } as unknown as import("viem").PublicClient;

    const outcome = await triggerDeposit(walletClient, publicClient, plan);
    expect(outcome).toBe("error");
  });
});

describe("checkGasBalance", () => {
  it("does not throw when balance is healthy", async () => {
    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(5n * 10n ** 18n),
    } as unknown as import("viem").PublicClient;
    const walletClient = { account: { address: "0xkeeper" } } as unknown as import("viem").WalletClient;

    await expect(checkGasBalance(publicClient, walletClient)).resolves.not.toThrow();
  });

  it("does not throw (only warns) when balance is low", async () => {
    const publicClient = {
      getBalance: vi.fn().mockResolvedValue(1n),
    } as unknown as import("viem").PublicClient;
    const walletClient = { account: { address: "0xkeeper" } } as unknown as import("viem").WalletClient;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkGasBalance(publicClient, walletClient);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("LOW GAS WARNING"));
    warnSpy.mockRestore();
  });
});
