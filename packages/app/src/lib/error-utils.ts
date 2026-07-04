// Maps raw viem/RPC/wallet errors to short, human-readable messages so users
// never see a raw stack trace or JSON-RPC error string.
//
// Call this ONLY on errors caught directly from a wallet/RPC call
// (sendTransaction, waitForTransactionReceipt, readContract, etc). Errors
// explicitly thrown elsewhere in this codebase (backend validation
// messages, our own guard checks) are already human-written — re-throw
// those as-is rather than passing them through this function, or their
// wording will be replaced by one of the generic buckets below.
export function toFriendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (lower.includes("chainmismatch") || lower.includes("does not match the target chain")) {
    return "You're connected to the wrong network. Switch your wallet to Celo and try again.";
  }
  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction cancelled.";
  }
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance") || lower.includes("exceeds balance")) {
    return "Insufficient balance to cover this transaction and its network fee.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The transaction is taking longer than expected. Check your wallet for its status before retrying.";
  }
  if (lower.includes("fetch") || lower.includes("network error") || lower.includes("failed to fetch")) {
    return "Network error — please check your connection and try again.";
  }
  if (lower.includes("wallet not connected") || lower.includes("not ready")) {
    return msg;
  }

  return "Something went wrong with this transaction. Please try again.";
}
