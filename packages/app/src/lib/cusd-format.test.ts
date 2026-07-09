import { describe, it, expect } from "vitest";
import { CUSD_DECIMALS, formatCusd, parseCusd } from "./cusd-format";

describe("CUSD_DECIMALS", () => {
  it("is 18, not 6 — cUSD, not USDT/USDC", () => {
    expect(CUSD_DECIMALS).toBe(18);
  });
});

describe("formatCusd", () => {
  it("formats zero and negative amounts as $0.00", () => {
    expect(formatCusd(0n)).toBe("$0.00");
    expect(formatCusd(-1n)).toBe("$0.00");
  });

  it("formats a whole-dollar 18-decimal amount", () => {
    expect(formatCusd(10n * 10n ** 18n)).toBe("$10.00");
  });

  it("formats cents correctly", () => {
    expect(formatCusd(10_500_000_000_000_000_000n)).toBe("$10.50");
  });

  it("truncates (does not round) fractional cents", () => {
    // $0.019999... truncates to $0.01, not $0.02
    expect(formatCusd(19_999_999_999_999_999n)).toBe("$0.01");
  });

  it("truncates sub-cent dust to $0.00 rather than throwing or showing scientific notation", () => {
    expect(formatCusd(10n ** 15n)).toBe("$0.00"); // $0.001
  });

  it("respects a custom precision", () => {
    expect(formatCusd(19_999_999_999_999_999n, 4)).toBe("$0.0199");
  });
});

describe("parseCusd", () => {
  it("parses whole dollar amounts", () => {
    expect(parseCusd("5")).toBe(5n * 10n ** 18n);
  });

  it("parses fractional amounts", () => {
    expect(parseCusd("10.5")).toBe(10_500_000_000_000_000_000n);
  });

  it("returns 0n for empty, whitespace-only, or bare-dot input instead of throwing", () => {
    expect(parseCusd("")).toBe(0n);
    expect(parseCusd("   ")).toBe(0n);
    expect(parseCusd(".")).toBe(0n);
  });

  it("returns 0n for non-numeric input instead of throwing", () => {
    expect(parseCusd("abc")).toBe(0n);
    expect(parseCusd("1e18")).toBe(0n); // scientific notation must not slip through BigInt()
  });

  it("returns 0n for malformed multi-dot input", () => {
    expect(parseCusd("12.5.3")).toBe(0n);
  });

  it("returns 0n for negative input — Auto-Save never accepts a negative amount", () => {
    expect(parseCusd("-5")).toBe(0n);
  });

  it("truncates (does not round or overflow) fractional input longer than 18 decimals", () => {
    expect(parseCusd("1.9999999999999999999999")).toBe(1_999999999999999999n);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCusd("  10  ")).toBe(10n * 10n ** 18n);
  });
});
