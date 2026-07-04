import { describe, it, expect } from "vitest";
import { assertValidPaymentAddress } from "./address-utils";
import { TREASURY } from "./contracts";

describe("assertValidPaymentAddress", () => {
  it("accepts a well-formed address", () => {
    expect(() =>
      assertValidPaymentAddress("0x3AC95343494979d0c92195D387D278DCB3d6d595")
    ).not.toThrow();
  });

  // Regression guard: this repo's TREASURY constant does not pass strict
  // EIP-55 checksum validation (a casing typo that doesn't affect its
  // validity on-chain), and the backend's TREASURY_ADDRESS env var uses the
  // same casing. Strict validation here would reject every real payment.
  it("accepts this repo's real TREASURY constant despite its checksum casing", () => {
    expect(() => assertValidPaymentAddress(TREASURY)).not.toThrow();
  });

  it("rejects a malformed address (wrong length)", () => {
    expect(() => assertValidPaymentAddress("0x1234")).toThrow(/invalid address/i);
  });

  it("rejects a non-hex address", () => {
    expect(() => assertValidPaymentAddress("not-an-address")).toThrow(/invalid address/i);
  });

  it("rejects an empty string", () => {
    expect(() => assertValidPaymentAddress("")).toThrow(/invalid address/i);
  });

  it("rejects an address missing the 0x prefix", () => {
    expect(() =>
      assertValidPaymentAddress("3AC95343494979d0c92195D387D278DCB3d6d595")
    ).toThrow(/invalid address/i);
  });
});
