import dotenv from "dotenv";
dotenv.config();

import { initDb, closeDb } from "./lib/db";
import { assertKeeperConfigSafe } from "./lib/config-guard";
import { runKeeperCycle } from "./services/router-keeper";

// One-shot entrypoint for the Railway cron keeper — NOT the always-on
// Express server (see index.ts for that). Runs a single scan-and-deposit
// cycle, then exits, matching how Railway Cron Jobs are meant to run
// (they start a container on a schedule and expect it to terminate).
// See KEEPER.md for the Railway service setup and cron schedule.
async function main(): Promise<void> {
  assertKeeperConfigSafe();
  await initDb();
  try {
    await runKeeperCycle();
  } finally {
    closeDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error("[keeper] fatal error, exiting non-zero:", e);
    process.exit(1);
  });
