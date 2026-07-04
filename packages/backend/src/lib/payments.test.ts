import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb } from "./db";
import {
  reserveAirtimePayment,
  markAirtimePaymentCompleted,
  markAirtimePaymentFailed,
  getAirtimePayment,
  reserveAnalyticsPayment,
} from "./payments";

const TEST_DB_PATH = path.join(os.tmpdir(), `celosave-test-${Date.now()}.sqlite`);

beforeAll(async () => {
  await initDb(TEST_DB_PATH);
});

afterAll(() => {
  closeDb();
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}.tmp`, { force: true });
});

describe("reserveAirtimePayment", () => {
  it("reserves a fresh txHash successfully", () => {
    const result = reserveAirtimePayment({
      txHash: "0x" + "1".repeat(64),
      quoteId: "quote-a",
      phone: "+2348012345678",
      provider: "zendit",
      amountRaw: 1_015_000n,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects replay of the same txHash against a different quote", () => {
    const txHash = "0x" + "2".repeat(64);
    const first = reserveAirtimePayment({
      txHash,
      quoteId: "quote-b",
      phone: "+2348012345678",
      provider: "zendit",
      amountRaw: 1_015_000n,
    });
    expect(first.ok).toBe(true);

    // Same txHash, different quote — simulates replaying one real payment
    // against a freshly minted quote.
    const replay = reserveAirtimePayment({
      txHash,
      quoteId: "quote-c",
      phone: "+2348012345678",
      provider: "zendit",
      amountRaw: 1_015_000n,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("duplicate");
  });

  it("rejects replay even after the first attempt is marked failed", () => {
    const txHash = "0x" + "3".repeat(64);
    reserveAirtimePayment({
      txHash,
      quoteId: "quote-d",
      phone: "+2348012345678",
      provider: "at",
      amountRaw: 2_030_000n,
    });
    markAirtimePaymentFailed(txHash, "provider error");

    const replay = reserveAirtimePayment({
      txHash,
      quoteId: "quote-e",
      phone: "+2348012345678",
      provider: "at",
      amountRaw: 500_000n, // even a smaller quote must not be allowed to reuse it
    });
    expect(replay.ok).toBe(false);
  });

  it("binds the reserved amount to the verified on-chain amount, not the request", () => {
    const txHash = "0x" + "4".repeat(64);
    reserveAirtimePayment({
      txHash,
      quoteId: "quote-f",
      phone: "+2348012345678",
      provider: "zendit",
      amountRaw: 5_000_000n,
    });
    markAirtimePaymentCompleted(txHash, "req-1", "NGN 1000");

    const record = getAirtimePayment(txHash);
    expect(record?.amountRaw).toBe("5000000");
    expect(record?.status).toBe("completed");
    expect(record?.requestId).toBe("req-1");
  });

  it("persists a failed delivery so it can be looked up via status", () => {
    const txHash = "0x" + "5".repeat(64);
    reserveAirtimePayment({
      txHash,
      quoteId: "quote-g",
      phone: "+2348012345678",
      provider: "at",
      amountRaw: 1_000_000n,
    });
    markAirtimePaymentFailed(txHash, "Airtime provider error: timeout");

    const record = getAirtimePayment(txHash);
    expect(record?.status).toBe("failed");
    expect(record?.error).toContain("timeout");
  });

  it("returns null for an unknown txHash", () => {
    expect(getAirtimePayment("0x" + "9".repeat(64))).toBeNull();
  });

  it("only lets one of two concurrent requests for the same txHash win", async () => {
    const txHash = "0x" + "7".repeat(64);

    // Simulates two Express request handlers both finishing async on-chain
    // verification at roughly the same time and racing to reserve the same
    // txHash. reserveAirtimePayment itself never awaits, so whichever
    // handler's synchronous reserve call runs first wins outright.
    async function attempt(quoteId: string) {
      await Promise.resolve(); // yield once, like a real await verifyUsdtTransfer(...)
      return reserveAirtimePayment({
        txHash,
        quoteId,
        phone: "+2348012345678",
        provider: "zendit",
        amountRaw: 1_000_000n,
      });
    }

    const [a, b] = await Promise.all([attempt("quote-race-1"), attempt("quote-race-2")]);
    const results = [a, b];
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });
});

describe("reserveAnalyticsPayment", () => {
  it("reserves a fresh txHash and rejects replay", () => {
    const txHash = "0x" + "6".repeat(64);
    const first = reserveAnalyticsPayment(txHash, 1000n);
    expect(first.ok).toBe(true);

    const replay = reserveAnalyticsPayment(txHash, 1000n);
    expect(replay.ok).toBe(false);
  });
});
