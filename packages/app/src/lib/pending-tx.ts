const PREFIX = "celosave:pending-tx:";

export interface PendingTx {
  txHash: `0x${string}`;
  amountRaw?: string; // bigint serialized as a decimal string
}

// A pending deposit/withdraw survives a page reload as a plain sessionStorage
// record so a backgrounded/closed MiniPay webview doesn't lose track of an
// in-flight transaction and silently reset to "idle" with no memory of it.
export function savePendingTx(key: string, tx: PendingTx): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(tx));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — non-fatal
  }
}

export function loadPendingTx(key: string): PendingTx | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as PendingTx) : null;
  } catch {
    return null;
  }
}

export function clearPendingTx(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
