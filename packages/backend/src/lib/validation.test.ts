import { describe, it, expect } from "vitest";
import { quoteRequestSchema, topupRequestSchema, statusQuerySchema } from "./validation";

describe("quoteRequestSchema", () => {
  const valid = { phone: "+2348012345678", countryCode: "NG", usdAmount: 2 };

  it("accepts a valid request", () => {
    expect(quoteRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-E.164 phone number", () => {
    const result = quoteRequestSchema.safeParse({ ...valid, phone: "08012345678" });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported country code", () => {
    const result = quoteRequestSchema.safeParse({ ...valid, countryCode: "XX" });
    expect(result.success).toBe(false);
  });

  it("rejects a phone/country dial-code mismatch", () => {
    // Kenyan dial code but Nigeria selected
    const result = quoteRequestSchema.safeParse({ ...valid, phone: "+254711082316" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    const result = quoteRequestSchema.safeParse({ ...valid, usdAmount: "5" as unknown as number });
    expect(result.success).toBe(false);
  });

  it("rejects an amount below the minimum", () => {
    expect(quoteRequestSchema.safeParse({ ...valid, usdAmount: 0.1 }).success).toBe(false);
  });

  it("rejects an amount above the maximum", () => {
    expect(quoteRequestSchema.safeParse({ ...valid, usdAmount: 500 }).success).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(quoteRequestSchema.safeParse({ ...valid, usdAmount: NaN }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...valid, usdAmount: Infinity }).success).toBe(false);
  });
});

describe("topupRequestSchema", () => {
  const validQuoteId = "11111111-1111-1111-1111-111111111111";
  const validTxHash = "0x" + "a".repeat(64);

  it("accepts a valid request", () => {
    expect(
      topupRequestSchema.safeParse({ quoteId: validQuoteId, txHash: validTxHash }).success
    ).toBe(true);
  });

  it("rejects a malformed txHash", () => {
    expect(
      topupRequestSchema.safeParse({ quoteId: validQuoteId, txHash: "0xnothex" }).success
    ).toBe(false);
  });

  it("rejects a txHash of the wrong length", () => {
    expect(
      topupRequestSchema.safeParse({ quoteId: validQuoteId, txHash: "0x" + "a".repeat(10) })
        .success
    ).toBe(false);
  });

  it("rejects a non-UUID quoteId", () => {
    expect(
      topupRequestSchema.safeParse({ quoteId: "not-a-uuid", txHash: validTxHash }).success
    ).toBe(false);
  });
});

describe("statusQuerySchema", () => {
  it("rejects a missing txHash", () => {
    expect(statusQuerySchema.safeParse({}).success).toBe(false);
  });
});
