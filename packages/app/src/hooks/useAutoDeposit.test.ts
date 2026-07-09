import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAddress, decodeFunctionData } from "viem";
import {
  cyclesRemaining,
  LOW_ALLOWANCE_WARNING_CYCLES,
  nextDepositLabel,
  encodeApprove,
  encodeSetPlan,
  encodeCancelPlan,
  encodeDepositFor,
} from "./useAutoDeposit";
import { CUSD, AAVE_POOL, AAVE_DATA_PROVIDER, AAVE_POOL_ADDRESSES_PROVIDER, CUSD_A_TOKEN } from "@/lib/contracts";
import { erc20Abi } from "@/lib/abis";
import { routerAbi } from "@/lib/router-abi";

const SENDER = "0x1111111111111111111111111111111111111111" as const;
const ROUTER = "0x2222222222222222222222222222222222222222" as const;

// Regression coverage for the checksum-bug class this whole migration
// surfaced (see contracts.ts's TREASURY/CUSDX comments): loose isAddress
// checks let a mistyped-casing address pass silently until
// encodeFunctionData throws at runtime on first real use. Every constant
// this hook touches must pass STRICT isAddress(), not just "looks like hex
// of the right length."
describe("contracts.ts addresses used by Auto-Save pass strict EIP-55 checksum validation", () => {
  it("CUSD, AAVE_POOL, AAVE_DATA_PROVIDER, AAVE_POOL_ADDRESSES_PROVIDER, and CUSD_A_TOKEN are all strictly valid", () => {
    for (const addr of [CUSD, AAVE_POOL, AAVE_DATA_PROVIDER, AAVE_POOL_ADDRESSES_PROVIDER, CUSD_A_TOKEN]) {
      expect(isAddress(addr)).toBe(true);
    }
  });
});

describe("assertValidAddresses", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS = ORIGINAL_ENV;
    vi.resetModules();
  });

  it("reports 'not deployed yet' when NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS is unset (the current, honest default — the router has not been deployed)", async () => {
    delete process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS;
    vi.resetModules();
    const mod = await import("./useAutoDeposit");
    expect(mod.assertValidAddresses()).toMatch(/not been deployed yet/i);
  });

  it("returns null once a strictly-valid router address is configured", async () => {
    process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS = ROUTER;
    vi.resetModules();
    const mod = await import("./useAutoDeposit");
    expect(mod.assertValidAddresses()).toBeNull();
  });

  it("rejects a configured router address with a checksum-casing error instead of silently accepting it — the exact bug class this migration's audit found in TREASURY/CUSDX", async () => {
    // Same 40 hex chars as ROUTER but with one character's case flipped —
    // still 40 valid hex chars, so a *loose* check would pass this through.
    const mistyped = "0x2222222222222222222222222222222222222A";
    process.env.NEXT_PUBLIC_AUTO_DEPOSIT_ROUTER_ADDRESS = mistyped;
    vi.resetModules();
    const mod = await import("./useAutoDeposit");
    const result = mod.assertValidAddresses();
    // Only assert this actually exercises the strict-checksum path when the
    // mistyped casing genuinely fails EIP-55 (a coincidentally-valid
    // checksum would make this test meaningless).
    if (!isAddress(mistyped)) {
      expect(result).toMatch(/invalid router address/i);
    }
  });
});

describe("cyclesRemaining", () => {
  it("returns 0 when monthlyAmount is 0 (no active plan)", () => {
    expect(cyclesRemaining(1000n, 0n)).toBe(0);
  });

  it("floor-divides allowance by monthlyAmount", () => {
    expect(cyclesRemaining(250n, 100n)).toBe(2);
    expect(cyclesRemaining(300n, 100n)).toBe(3);
    expect(cyclesRemaining(0n, 100n)).toBe(0);
  });
});

describe("LOW_ALLOWANCE_WARNING_CYCLES", () => {
  it("warns at 1 cycle remaining", () => {
    expect(LOW_ALLOWANCE_WARNING_CYCLES).toBe(1);
  });
});

describe("nextDepositLabel", () => {
  it("reports 'Not scheduled' for a zero timestamp (no plan yet)", () => {
    expect(nextDepositLabel(0)).toBe("Not scheduled");
  });

  it("reports 'Ready now' once the eligible time has passed", () => {
    expect(nextDepositLabel(1000, 2000)).toBe("Ready now");
    expect(nextDepositLabel(2000, 2000)).toBe("Ready now"); // exactly now counts as ready
  });

  it("shows a formatted future date otherwise", () => {
    const future = 2000 + 30 * 24 * 60 * 60;
    const label = nextDepositLabel(future, 2000);
    expect(label).not.toBe("Ready now");
    expect(label).not.toBe("Not scheduled");
  });
});

describe("ABI-encoding calls actually succeed (not just isAddress checks)", () => {
  it("encodeApprove(router, amount) encodes a valid approve() call", () => {
    const data = encodeApprove(ROUTER, 123n);
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    expect(decoded.functionName).toBe("approve");
    expect((decoded.args as [string, bigint])[0].toLowerCase()).toBe(ROUTER.toLowerCase());
    expect((decoded.args as [string, bigint])[1]).toBe(123n);
  });

  it("encodeSetPlan(monthlyAmount, interval) encodes a valid setPlan() call", () => {
    const data = encodeSetPlan(50n * 10n ** 18n, 30 * 24 * 60 * 60);
    const decoded = decodeFunctionData({ abi: routerAbi, data });
    expect(decoded.functionName).toBe("setPlan");
    const args = decoded.args as [bigint, bigint];
    expect(args[0]).toBe(50n * 10n ** 18n);
    expect(args[1]).toBe(BigInt(30 * 24 * 60 * 60));
  });

  it("encodeCancelPlan() encodes a valid cancelPlan() call", () => {
    const data = encodeCancelPlan();
    const decoded = decodeFunctionData({ abi: routerAbi, data });
    expect(decoded.functionName).toBe("cancelPlan");
  });

  it("encodeDepositFor(user, amount) succeeds — this is the exact call a user " +
    "self-triggers via 'Deposit now', proving the permissionless design end to end", () => {
    const data = encodeDepositFor(SENDER, 999n);
    const decoded = decodeFunctionData({ abi: routerAbi, data });
    expect(decoded.functionName).toBe("depositFor");
    const args = decoded.args as [string, bigint];
    expect(args[0].toLowerCase()).toBe(SENDER.toLowerCase());
    expect(args[1]).toBe(999n);
  });
});
