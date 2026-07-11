import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns the result immediately on first success, no retries", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("transient RPC error");
      return "ok";
    });
    const result = await withRetry(fn, { attempts: 5, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still failing"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("still failing");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry with the attempt number and error for every failed attempt", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, onRetry })).rejects.toThrow();
    // onRetry fires once per failed attempt, including the last one — it
    // just isn't followed by a sleep once attempts are exhausted.
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Error));
  });

  it("defaults to 3 attempts when not specified", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("x"));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
