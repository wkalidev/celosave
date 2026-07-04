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
