import { describe, it, expect } from "vitest";
import { toFriendlyError } from "./error-utils";

describe("toFriendlyError", () => {
  it("maps a chain mismatch error", () => {
    expect(
      toFriendlyError(new Error("The current chain of the wallet (id: 44787) does not match the target chain for the transaction (id: 42220 – Celo)."))
    ).toMatch(/wrong network/i);
  });

  it("maps a user-rejected error", () => {
    expect(toFriendlyError(new Error("User rejected the request."))).toMatch(/cancelled/i);
  });

  it("maps an insufficient funds error", () => {
    expect(
      toFriendlyError(new Error("insufficient funds for gas * price + value: address 0x... have 0 want 210000000000000"))
    ).toMatch(/insufficient balance/i);
  });

  it("maps a network/fetch error", () => {
    expect(toFriendlyError(new Error("failed to fetch"))).toMatch(/network error/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(toFriendlyError(new Error("some obscure internal RPC code 0xdead"))).toMatch(
      /something went wrong/i
    );
  });

  it("handles non-Error values", () => {
    expect(toFriendlyError("just a string")).toMatch(/something went wrong/i);
  });
});
