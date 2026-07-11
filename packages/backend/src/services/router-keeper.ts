import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import type { Address, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { routerAbi } from "../lib/router-abi";
import { withRetry } from "../lib/retry";
import {
  getLastScannedBlock,
  setLastScannedBlock,
  recordKnownUser,
  getKnownUsers,
  logDepositAttempt,
} from "../lib/keeper-store";

// ── Router keeper ────────────────────────────────────────────────────────
//
// Calls the permissionless CeloSaveAutoDepositRouter.depositFor(user, amount)
// on behalf of every user with an eligible plan. This keeper is a
// convenience, not a trust requirement: depositFor is deliberately callable
// by anyone, and the contract itself — not this service — enforces that a
// deposit can only happen for the exact plan amount at or after
// nextExecutionTime (see CeloSaveAutoDepositRouter.sol). If this keeper is
// down, delayed, or wrong in some way, the worst case is a missed cycle,
// never an incorrect one: any user (or anyone else) can call depositFor
// directly, or run this script themselves, to trigger their own eligible
// cycle immediately. See KEEPER.md.
//
// The keeper wallet (KEEPER_PRIVATE_KEY) only ever pays its own CELO gas to
// call depositFor. It never receives, custodies, or is approved to move any
// user's cUSD — the router pulls funds via transferFrom(user, ...) using the
// allowance the user themselves granted, straight to Aave, in the same
// transaction. See the "Custody model" section of the security report.

const ROUTER_ADDRESS = process.env.AUTO_DEPOSIT_ROUTER_ADDRESS as Address;

// How many blocks to request per eth_getLogs call. Most RPC providers
// (Alchemy included) cap log-range queries — chunking keeps every call well
// under typical limits regardless of provider, and keeps a single slow
// request from timing out.
const LOG_SCAN_CHUNK_BLOCKS = 5_000n;

// Warn (not fail) when the keeper wallet's own gas balance drops below this —
// an early signal to top it up before deposits actually start failing.
const LOW_GAS_BALANCE_WEI = 10n ** 18n; // ~1 CELO

// Router deployment block — scanning never needs to start earlier than this.
// Confirmed via the deployment tx (0xe1f5835876801e532da64e35da0678061907a6a2a42a30a789b1090e8a9599e1),
// block 71726465, 2026-07-09. Cross-checked: its decoded constructor args
// (cUSD, PoolAddressesProvider, feeBps=25, feeRecipient=TREASURY) match this
// repo's deployed constants exactly.
const ROUTER_DEPLOY_BLOCK = 71_726_465n;

function rpcUrl(): string {
  return `https://celo-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
}

function getClients(): { publicClient: PublicClient; walletClient: WalletClient } {
  const transport = http(rpcUrl());
  const publicClient = createPublicClient({ chain: celo, transport }) as PublicClient;
  const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: celo, transport }) as WalletClient;
  return { publicClient, walletClient };
}

const PLAN_SET_EVENT = parseAbiItem(
  "event PlanSet(address indexed user, uint256 monthlyAmount, uint256 interval, uint256 nextExecutionTime)"
);

// Discover new users by scanning PlanSet logs since the last run, in
// bounded-size chunks. Never trusted for eligibility on its own — see the
// module doc comment above.
export async function scanForNewUsers(publicClient: PublicClient): Promise<{
  newUsersFound: number;
  scannedFrom: bigint;
  scannedTo: bigint;
}> {
  const latestBlock = await withRetry(() => publicClient.getBlockNumber(), {
    onRetry: (attempt, e) => console.warn(`[keeper] getBlockNumber retry ${attempt}:`, e),
  });

  const cursor = getLastScannedBlock();
  const fromBlock = cursor !== null && cursor >= ROUTER_DEPLOY_BLOCK ? cursor + 1n : ROUTER_DEPLOY_BLOCK;

  if (fromBlock > latestBlock) {
    return { newUsersFound: 0, scannedFrom: fromBlock, scannedTo: latestBlock };
  }

  let newUsersFound = 0;
  let chunkStart = fromBlock;

  while (chunkStart <= latestBlock) {
    const chunkEnd = chunkStart + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
      ? latestBlock
      : chunkStart + LOG_SCAN_CHUNK_BLOCKS - 1n;

    const logs = await withRetry(
      () =>
        publicClient.getLogs({
          address: ROUTER_ADDRESS,
          event: PLAN_SET_EVENT,
          fromBlock: chunkStart,
          toBlock: chunkEnd,
        }),
      { onRetry: (attempt, e) => console.warn(`[keeper] getLogs retry ${attempt} (${chunkStart}-${chunkEnd}):`, e) }
    );

    for (const log of logs) {
      const user = log.args.user;
      if (!user) continue;
      recordKnownUser(user, log.blockNumber ?? chunkEnd);
      newUsersFound++;
    }

    // Persist the cursor after each chunk (not just at the end) so a crash
    // mid-scan on a large backlog doesn't force re-scanning from the start.
    setLastScannedBlock(chunkEnd);
    chunkStart = chunkEnd + 1n;
  }

  return { newUsersFound, scannedFrom: fromBlock, scannedTo: latestBlock };
}

export interface EligiblePlan {
  user: Address;
  monthlyAmount: bigint;
}

// The authoritative eligibility check — reads live on-chain state for every
// known user immediately before deciding whether to trigger. This is what
// actually protects against a stale or incomplete local index: even if
// scanForNewUsers missed someone or ran against a slightly stale cursor,
// this function only ever acts on what the contract says right now.
export async function getEligibleDeposits(publicClient: PublicClient): Promise<EligiblePlan[]> {
  const users = getKnownUsers();
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const eligible: EligiblePlan[] = [];

  for (const user of users) {
    try {
      const plan = await withRetry(
        () =>
          publicClient.readContract({
            address: ROUTER_ADDRESS,
            abi: routerAbi,
            functionName: "plans",
            args: [user as Address],
          }),
        { onRetry: (attempt, e) => console.warn(`[keeper] plans(${user}) retry ${attempt}:`, e) }
      );
      const [monthlyAmount, , nextExecutionTime, active] = plan;
      if (active && nowSeconds >= nextExecutionTime) {
        eligible.push({ user: user as Address, monthlyAmount });
      }
    } catch (e: unknown) {
      // A persistent read failure for one user must never block the rest of
      // the run — log and move on, this user is simply retried next cycle.
      console.error(`[keeper] failed to read plan for ${user}, skipping this cycle:`, e);
    }
  }

  return eligible;
}

export type DepositOutcome = "success" | "reverted" | "error";

// Sends one depositFor(user, amount) and waits for its receipt. Sent
// sequentially by the caller (never in parallel) to avoid nonce races on a
// single keeper wallet. Network-level failures while submitting or polling
// are retried; an on-chain revert is not (retrying a deterministic revert
// only burns more gas for the same outcome) — it's logged and left for the
// next cycle's fresh eligibility check.
export async function triggerDeposit(
  walletClient: WalletClient,
  publicClient: PublicClient,
  plan: EligiblePlan
): Promise<DepositOutcome> {
  try {
    const txHash = await withRetry(
      () =>
        walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "depositFor",
          args: [plan.user, plan.monthlyAmount],
          chain: celo,
          account: walletClient.account!,
        }),
      { onRetry: (attempt, e) => console.warn(`[keeper] depositFor(${plan.user}) send retry ${attempt}:`, e) }
    );

    const receipt = await withRetry(() => publicClient.waitForTransactionReceipt({ hash: txHash }), {
      attempts: 5,
      baseDelayMs: 2000,
      onRetry: (attempt, e) => console.warn(`[keeper] waitForTransactionReceipt retry ${attempt}:`, e),
    });

    if (receipt.status === "success") {
      console.log(`[keeper] deposit succeeded for ${plan.user}: ${txHash}`);
      logDepositAttempt({ userAddress: plan.user, amountRaw: plan.monthlyAmount, txHash, status: "success", error: null });
      return "success";
    }

    console.error(`[keeper] deposit reverted on-chain for ${plan.user}: ${txHash}`);
    logDepositAttempt({ userAddress: plan.user, amountRaw: plan.monthlyAmount, txHash, status: "reverted", error: null });
    return "reverted";
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[keeper] deposit errored for ${plan.user}:`, message);
    logDepositAttempt({ userAddress: plan.user, amountRaw: plan.monthlyAmount, txHash: null, status: "error", error: message });
    return "error";
  }
}

export async function checkGasBalance(publicClient: PublicClient, walletClient: WalletClient): Promise<void> {
  const address = walletClient.account?.address;
  if (!address) return;
  const balance = await publicClient.getBalance({ address });
  if (balance < LOW_GAS_BALANCE_WEI) {
    console.warn(
      `[keeper] LOW GAS WARNING: keeper wallet ${address} has ${balance} wei CELO — top it up before it can no longer submit transactions.`
    );
  }
}

export async function runKeeperCycle(): Promise<void> {
  const startedAt = Date.now();
  const { publicClient, walletClient } = getClients();

  console.log(`[keeper] run started at ${new Date(startedAt).toISOString()}`);

  await checkGasBalance(publicClient, walletClient);

  const scanResult = await scanForNewUsers(publicClient);
  console.log(
    `[keeper] scanned blocks ${scanResult.scannedFrom}-${scanResult.scannedTo}, ${scanResult.newUsersFound} new user(s) discovered`
  );

  const eligible = await getEligibleDeposits(publicClient);
  console.log(`[keeper] ${eligible.length} plan(s) eligible this cycle`);

  let succeeded = 0;
  let reverted = 0;
  let errored = 0;

  // Sequential, not Promise.all — see triggerDeposit's doc comment.
  for (const plan of eligible) {
    const outcome = await triggerDeposit(walletClient, publicClient, plan);
    if (outcome === "success") succeeded++;
    else if (outcome === "reverted") reverted++;
    else errored++;
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[keeper] run finished in ${durationMs}ms — deposits: ${succeeded} succeeded, ${reverted} reverted, ${errored} errored`
  );
}
