import { getDb, persist } from "./db";

// Cursor + user-discovery + audit-log helpers for the router keeper. Same
// sql.js-backed pattern as payments.ts: synchronous db.run/db.exec calls,
// explicit persist() after every write so state survives a restart.

export function getLastScannedBlock(): bigint | null {
  const db = getDb();
  const result = db.exec(`SELECT value FROM keeper_state WHERE key = 'last_scanned_block'`);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return BigInt(result[0].values[0][0] as string);
}

export function setLastScannedBlock(blockNumber: bigint): void {
  const db = getDb();
  db.run(
    `INSERT INTO keeper_state (key, value) VALUES ('last_scanned_block', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [blockNumber.toString()]
  );
  persist();
}

// Idempotent — safe to call for a user we already know about (e.g. they
// cancelled and later re-subscribed, emitting a second PlanSet).
export function recordKnownUser(address: string, blockNumber: bigint): void {
  const db = getDb();
  db.run(
    `INSERT OR IGNORE INTO keeper_known_users (address, first_seen_block, first_seen_at) VALUES (?, ?, ?)`,
    [address.toLowerCase(), Number(blockNumber), Date.now()]
  );
  persist();
}

export function getKnownUsers(): string[] {
  const db = getDb();
  const result = db.exec(`SELECT address FROM keeper_known_users`);
  if (result.length === 0) return [];
  return result[0].values.map((row) => row[0] as string);
}

export type DepositLogStatus = "success" | "reverted" | "error";

export function logDepositAttempt(params: {
  userAddress: string;
  amountRaw: bigint;
  txHash: string | null;
  status: DepositLogStatus;
  error: string | null;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO keeper_deposit_log (user_address, amount_raw, tx_hash, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.userAddress.toLowerCase(),
      params.amountRaw.toString(),
      params.txHash,
      params.status,
      params.error,
      Date.now(),
    ]
  );
  persist();
}
