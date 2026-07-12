// Generic retry-with-backoff for transient failures (RPC hiccups, timeouts,
// rate limits). Not for use around anything whose failure could be a
// deterministic on-chain revert — retrying a revert wastes gas and will
// just fail the same way again; callers must only wrap the parts that can
// fail for network/infra reasons.
export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
  // Classify whether a given failure is worth retrying at all. Defaults to
  // "always retry" (unchanged behavior for every existing caller). Pass this
  // when a failure can be deterministic rather than transient — e.g. an RPC
  // provider rejecting a request as malformed for the current plan/tier.
  // Retrying an identical request that was rejected for its shape, not for
  // a transient network reason, produces the same rejection every time; it
  // just delays the inevitable failure while burning attempts and backoff
  // time for nothing.
  isRetryable?: (error: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastError = e;
      if (!isRetryable(e)) {
        // Fail immediately — no onRetry call, no backoff sleep, since no
        // retry is actually happening.
        throw e;
      }
      opts.onRetry?.(attempt, e);
      if (attempt < attempts) {
        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
