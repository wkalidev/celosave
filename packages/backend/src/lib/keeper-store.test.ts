import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb } from "./db";
import {
  getLastScannedBlock,
  setLastScannedBlock,
  recordKnownUser,
  getKnownUsers,
  logDepositAttempt,
} from "./keeper-store";

const TEST_DB_PATH = path.join(os.tmpdir(), `celosave-keeper-test-${Date.now()}.sqlite`);

beforeAll(async () => {
  await initDb(TEST_DB_PATH);
});

afterAll(() => {
  closeDb();
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}.tmp`, { force: true });
});

describe("keeper scan cursor", () => {
  it("returns null before any cursor has ever been set", () => {
    expect(getLastScannedBlock()).toBeNull();
  });

  it("round-trips a block number, including one too large for a JS number", () => {
    const big = 71_726_465n;
    setLastScannedBlock(big);
    expect(getLastScannedBlock()).toBe(big);
  });

  it("overwrites the previous cursor rather than accumulating rows", () => {
    setLastScannedBlock(100n);
    setLastScannedBlock(200n);
    expect(getLastScannedBlock()).toBe(200n);
  });
});

describe("keeper known users", () => {
  it("records a user discovered via PlanSet", () => {
    recordKnownUser("0xAAAA000000000000000000000000000000AAAA", 71_726_465n);
    expect(getKnownUsers()).toContain("0xaaaa000000000000000000000000000000aaaa");
  });

  it("is idempotent — recording the same user twice does not duplicate it", () => {
    const before = getKnownUsers().length;
    recordKnownUser("0xAAAA000000000000000000000000000000AAAA", 71_726_500n);
    expect(getKnownUsers().length).toBe(before);
  });

  it("normalizes address casing to lowercase", () => {
    recordKnownUser("0xBBBB000000000000000000000000000000bbbb", 1n);
    const users = getKnownUsers();
    expect(users).toContain("0xbbbb000000000000000000000000000000bbbb");
    expect(users.some((u) => u !== u.toLowerCase())).toBe(false);
  });
});

describe("keeper deposit log", () => {
  it("logs a successful deposit attempt without throwing", () => {
    expect(() =>
      logDepositAttempt({
        userAddress: "0xCCCC000000000000000000000000000000cccc",
        amountRaw: 10_000_000_000_000_000_000n,
        txHash: "0x" + "1".repeat(64),
        status: "success",
        error: null,
      })
    ).not.toThrow();
  });

  it("logs a reverted attempt with a null txHash-safe error field", () => {
    expect(() =>
      logDepositAttempt({
        userAddress: "0xCCCC000000000000000000000000000000cccc",
        amountRaw: 5_000_000_000_000_000_000n,
        txHash: null,
        status: "error",
        error: "RPC timeout after 3 retries",
      })
    ).not.toThrow();
  });
});
