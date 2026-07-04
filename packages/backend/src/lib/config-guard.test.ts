import { describe, it, expect } from "vitest";
import { assertProductionConfigSafe } from "./config-guard";

const BASE_ENV = { TREASURY_ADDRESS: "0x3AC95343494979d0c92195D387D278DCB3d6d595" };

describe("assertProductionConfigSafe", () => {
  it("refuses to boot when NODE_ENV=production and SANDBOX_SKIP_VERIFY=true", () => {
    expect(() =>
      assertProductionConfigSafe({
        ...BASE_ENV,
        NODE_ENV: "production",
        SANDBOX_SKIP_VERIFY: "true",
      })
    ).toThrow(/SANDBOX_SKIP_VERIFY/);
  });

  it("boots fine when SANDBOX_SKIP_VERIFY=true outside production", () => {
    expect(() =>
      assertProductionConfigSafe({
        ...BASE_ENV,
        NODE_ENV: "development",
        SANDBOX_SKIP_VERIFY: "true",
      })
    ).not.toThrow();
  });

  it("boots fine in production when SANDBOX_SKIP_VERIFY is unset", () => {
    expect(() =>
      assertProductionConfigSafe({
        ...BASE_ENV,
        NODE_ENV: "production",
      })
    ).not.toThrow();
  });

  it("refuses to boot when TREASURY_ADDRESS is missing, in any environment", () => {
    expect(() => assertProductionConfigSafe({ NODE_ENV: "development" })).toThrow(
      /TREASURY_ADDRESS/
    );
    expect(() => assertProductionConfigSafe({ NODE_ENV: "production" })).toThrow(
      /TREASURY_ADDRESS/
    );
  });
});
