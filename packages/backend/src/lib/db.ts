import fs from "fs";
import path from "path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

// Pure-WASM SQLite (no native addon) — the repo runs pnpm with
// ignore-scripts=true and deploys to Alpine, so a native module like
// better-sqlite3 would need build tooling this project deliberately
// doesn't install. sql.js works identically everywhere with zero setup.
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "celosave.sqlite");

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let activePath: string = DB_PATH;

export async function initDb(customPath?: string): Promise<Database> {
  SQL = SQL ?? (await initSqlJs());
  activePath = customPath ?? DB_PATH;
  const dir = path.dirname(activePath);
  fs.mkdirSync(dir, { recursive: true });

  db = fs.existsSync(activePath)
    ? new SQL.Database(fs.readFileSync(activePath))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS airtime_payments (
      tx_hash TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      provider TEXT NOT NULL,
      amount_raw TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      request_id TEXT,
      delivery_amount TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analytics_payments (
      tx_hash TEXT PRIMARY KEY,
      amount_raw TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    -- Every address that has ever emitted PlanSet on the AutoDepositRouter.
    -- This is purely a discovery cache (there's no on-chain enumerable list
    -- of users) — it is never trusted for eligibility. The keeper always
    -- re-reads plans(user) live from the contract before triggering a
    -- deposit, so a stale or incomplete row here can cause a missed cycle
    -- (caught on the next scan) but never an incorrect deposit.
    CREATE TABLE IF NOT EXISTS keeper_known_users (
      address TEXT PRIMARY KEY,
      first_seen_block INTEGER NOT NULL,
      first_seen_at INTEGER NOT NULL
    );
    -- Small key/value store for keeper cursor state (e.g. last_scanned_block).
    CREATE TABLE IF NOT EXISTS keeper_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- Audit log of every depositFor attempt the keeper has made. Railway logs
    -- rotate/expire; this table is the durable record for debugging and for
    -- the "did the keeper actually run" question.
    CREATE TABLE IF NOT EXISTS keeper_deposit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      amount_raw TEXT NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  persistTo(activePath);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized — call initDb() at startup");
  return db;
}

function persistTo(targetPath: string): void {
  if (!db) return;
  const data = db.export();
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, targetPath);
}

// Flush in-memory state to disk. Call synchronously (no awaits) right after
// any write so a reservation survives a restart the instant it's made, and
// so no `await` gap opens up between "check" and "persist" for concurrent
// requests to race through.
export function persist(): void {
  persistTo(activePath);
}

export function closeDb(): void {
  db?.close();
  db = null;
}
