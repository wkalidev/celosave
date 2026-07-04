import { getDb, persist } from "./db";

export type AirtimePaymentStatus = "pending" | "completed" | "failed";

export interface AirtimePaymentRecord {
  txHash: string;
  quoteId: string;
  phone: string;
  provider: string;
  amountRaw: string;
  status: AirtimePaymentStatus;
  requestId: string | null;
  deliveryAmount: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ReserveResult = { ok: true } | { ok: false; reason: "duplicate" };

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

// Synchronous, no-await reservation: this is the linchpin of the replay
// defense. Because Node is single-threaded and this function never awaits,
// two concurrent requests racing on the same txHash cannot both pass the
// INSERT — the second always hits the PRIMARY KEY constraint. Call this
// AFTER on-chain verification succeeds but BEFORE contacting any provider.
export function reserveAirtimePayment(params: {
  txHash: string;
  quoteId: string;
  phone: string;
  provider: string;
  amountRaw: bigint;
}): ReserveResult {
  const db = getDb();
  const now = Date.now();
  try {
    db.run(
      `INSERT INTO airtime_payments
        (tx_hash, quote_id, phone, provider, amount_raw, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        params.txHash.toLowerCase(),
        params.quoteId,
        params.phone,
        params.provider,
        params.amountRaw.toString(),
        now,
        now,
      ]
    );
    persist();
    return { ok: true };
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return { ok: false, reason: "duplicate" };
    throw e;
  }
}

export function markAirtimePaymentCompleted(
  txHash: string,
  requestId: string,
  deliveryAmount: string
): void {
  const db = getDb();
  db.run(
    `UPDATE airtime_payments SET status = 'completed', request_id = ?, delivery_amount = ?, updated_at = ? WHERE tx_hash = ?`,
    [requestId, deliveryAmount, Date.now(), txHash.toLowerCase()]
  );
  persist();
}

export function markAirtimePaymentFailed(txHash: string, error: string): void {
  const db = getDb();
  db.run(
    `UPDATE airtime_payments SET status = 'failed', error = ?, updated_at = ? WHERE tx_hash = ?`,
    [error, Date.now(), txHash.toLowerCase()]
  );
  persist();
}

export function getAirtimePayment(txHash: string): AirtimePaymentRecord | null {
  const db = getDb();
  const result = db.exec(`SELECT * FROM airtime_payments WHERE tx_hash = ?`, [
    txHash.toLowerCase(),
  ]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const columns = result[0].columns;
  const row = result[0].values[0];
  const rec = Object.fromEntries(columns.map((c, i) => [c, row[i]])) as Record<string, unknown>;

  return {
    txHash: rec.tx_hash as string,
    quoteId: rec.quote_id as string,
    phone: rec.phone as string,
    provider: rec.provider as string,
    amountRaw: rec.amount_raw as string,
    status: rec.status as AirtimePaymentStatus,
    requestId: (rec.request_id as string) ?? null,
    deliveryAmount: (rec.delivery_amount as string) ?? null,
    error: (rec.error as string) ?? null,
    createdAt: rec.created_at as number,
    updatedAt: rec.updated_at as number,
  };
}

export function reserveAnalyticsPayment(txHash: string, amountRaw: bigint): ReserveResult {
  const db = getDb();
  try {
    db.run(`INSERT INTO analytics_payments (tx_hash, amount_raw, created_at) VALUES (?, ?, ?)`, [
      txHash.toLowerCase(),
      amountRaw.toString(),
      Date.now(),
    ]);
    persist();
    return { ok: true };
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return { ok: false, reason: "duplicate" };
    throw e;
  }
}
