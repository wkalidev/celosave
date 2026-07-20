import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { InvalidRequestRpcError } from "viem";
import { initDb, closeDb, getDb, persist } from "../lib/db";
import { recordKnownUser } from "../lib/keeper-store";

const TEST_DB_PATH = path.join(os.tmpdir(), `celosave-router-keeper-test-${Date.now()}.sqlite`);
const ROUTER_ADDRESS = "0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f";

// router-keeper.ts reads AUTO_DEPOSIT_ROUTER_ADDRESS from process.env at
// module-load time, so it must be set before the module is imported — a
// static top-of-file import would be hoisted ahead of this assignment.
// Same pattern as packages/app/src/hooks/useAutoDeposit.test.ts.
let scanForNewUsers: typeof import("./router-keeper").scanForNewUsers;
let getEligibleDeposits: typeof import("./router-keeper").getEligibleDeposits;
let triggerDeposit: typeof import("./router-keeper").triggerDeposit;
let checkGasBalance: typeof import("./router-keeper").checkGasBalance;

beforeAll(async () => {
  process.env.AUTO_DEPOSIT_ROUTER_ADDRESS = ROUTER_ADDRESS;
  // No real pacing delay in tests (would just slow the suite down for no
  // benefit — the delay's existence/placement is what's under test, not its
  // literal duration). A small-but-not-tiny cap so the existing chunk-math
  // test (26-block range) stays well under it, while still being small
  // enough that a dedicated test below can exceed it and prove capping works.
  process.env.KEEPER_LOG_SCAN_DELAY_MS = "0";
  process.env.KEEPER_MAX_BLOCKS_PER_RUN = "1000";
  await initDb(TEST_DB_PATH);
  const mod = await import("./router-keeper.js");
  scanForNewUsers = mod.scanForNewUsers;
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
  // scanForNewUsers reads its starting block from keeper_state — clear it
  // too, or a cursor left behind by one test changes another test's
  // computed fromBlock.
  getDb().run("DELETE FROM keeper_state");
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

describe("scanForNewUsers", () => {
  // No persisted cursor (keeper_state cleared in beforeEach) — scanning
  // always starts from the router's deploy block, 71_726_465n, matching the
  // constant hardcoded in router-keeper.ts.
  const DEPLOY_BLOCK = 71_726_465n;

  it("requests eth_getLogs in chunks no larger than the free-tier cap (10 blocks)", async () => {
    const getLogs = vi.fn().mockResolvedValue([]);
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(DEPLOY_BLOCK + 25n), // 26-block range
      getLogs,
    } as unknown as import("viem").PublicClient;

    await scanForNewUsers(client);

    // 26 blocks at a 10-block chunk size -> 3 calls: [0,9], [10,19], [20,25].
    expect(getLogs).toHaveBeenCalledTimes(3);
    const ranges: [bigint, bigint][] = getLogs.mock.calls.map((call) => {
      const args = call[0] as { fromBlock: bigint; toBlock: bigint };
      return [args.fromBlock, args.toBlock];
    });
    expect(ranges).toEqual([
      [DEPLOY_BLOCK, DEPLOY_BLOCK + 9n],
      [DEPLOY_BLOCK + 10n, DEPLOY_BLOCK + 19n],
      [DEPLOY_BLOCK + 20n, DEPLOY_BLOCK + 25n],
    ]);
    // No call ever spans more than 10 blocks inclusive.
    for (const [from, to] of ranges) {
      expect(to - from + 1n).toBeLessThanOrEqual(10n);
    }
  });

  it("caps a single run's scan to MAX_BLOCKS_PER_RUN even when the backlog is far larger", async () => {
    const getLogs = vi.fn().mockResolvedValue([]);
    const client = {
      // 50,001-block backlog — far more than KEEPER_MAX_BLOCKS_PER_RUN=1000
      // (set in beforeAll), simulating an unpersisted cursor / long-offline
      // keeper against a router that's been live a while.
      getBlockNumber: vi.fn().mockResolvedValue(DEPLOY_BLOCK + 50_000n),
      getLogs,
    } as unknown as import("viem").PublicClient;

    const result = await scanForNewUsers(client);

    // 1000-block cap at a 10-block chunk size -> exactly 100 calls, not
    // 5,001 — this is the direct fix for firing thousands of getLogs calls
    // in one run and getting rate-limited (429) regardless of how correctly
    // each individual call is sized.
    expect(getLogs).toHaveBeenCalledTimes(100);
    expect(result.scannedTo).toBe(DEPLOY_BLOCK + 999n);
  });

  it("records a user discovered in a PlanSet log", async () => {
    const user = "0x7777777777777777777777777777777777777d";
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(DEPLOY_BLOCK),
      getLogs: vi.fn().mockResolvedValue([{ args: { user }, blockNumber: DEPLOY_BLOCK }]),
    } as unknown as import("viem").PublicClient;

    const result = await scanForNewUsers(client);
    expect(result.newUsersFound).toBe(1);

    const { getKnownUsers } = await import("../lib/keeper-store.js");
    expect(getKnownUsers()).toContain(user.toLowerCase());
  });

  it("does not retry when getLogs is rejected as malformed for the RPC tier", async () => {
    const tierError = new InvalidRequestRpcError(new Error("block range too large for free tier"));
    const getLogs = vi.fn().mockRejectedValue(tierError);
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(DEPLOY_BLOCK + 25n),
      getLogs,
    } as unknown as import("viem").PublicClient;

    await expect(scanForNewUsers(client)).rejects.toBe(tierError);
    // Fails fast on the very first chunk — no retries burned on a request
    // that would fail identically every time.
    expect(getLogs).toHaveBeenCalledTimes(1);
  });
});

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
      sendTransaction: vi.fn().mockResolvedValue("0xTXHASH1"),
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
      sendTransaction: vi.fn().mockResolvedValue("0xTXHASH2"),
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
      sendTransaction: vi.fn().mockRejectedValue(new Error("network error")),
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
