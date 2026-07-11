// Startup-time config validation. Throwing here prevents the process from
// ever calling app.listen() with a configuration that could accept
// unverified payments or silently misroute treasury funds.
export function assertProductionConfigSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.SANDBOX_SKIP_VERIFY === "true") {
    throw new Error(
      "Refusing to start: SANDBOX_SKIP_VERIFY=true in production would skip on-chain " +
        "payment verification entirely. Unset SANDBOX_SKIP_VERIFY or set it to false."
    );
  }

  if (!env.TREASURY_ADDRESS) {
    throw new Error(
      "Refusing to start: TREASURY_ADDRESS is not set. This address receives all bill-pay " +
        "funds — refusing to fall back to a hardcoded default."
    );
  }
}

// Startup-time config validation for the keeper entrypoint specifically
// (packages/backend/src/keeper.ts). Separate from assertProductionConfigSafe
// above so a missing keeper-only var can never block the main web service
// from booting, and vice versa.
export function assertKeeperConfigSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.AUTO_DEPOSIT_ROUTER_ADDRESS) {
    throw new Error(
      "Refusing to run: AUTO_DEPOSIT_ROUTER_ADDRESS is not set. Refusing to fall back to a " +
        "hardcoded or guessed router address."
    );
  }
  if (!env.KEEPER_PRIVATE_KEY) {
    throw new Error(
      "Refusing to run: KEEPER_PRIVATE_KEY is not set. This wallet only ever pays its own gas " +
        "to call the permissionless depositFor() — it must never be the same key as " +
        "TREASURY_ADDRESS or any wallet holding user or protocol funds."
    );
  }
  if (!env.ALCHEMY_API_KEY) {
    throw new Error("Refusing to run: ALCHEMY_API_KEY is not set — no RPC endpoint to read/send with.");
  }
}
