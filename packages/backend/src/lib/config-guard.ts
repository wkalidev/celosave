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
