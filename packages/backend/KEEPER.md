# Auto-Save Router Keeper

A small cron job that calls `depositFor(user, amount)` on
[`CeloSaveAutoDepositRouter`](../contracts/src/CeloSaveAutoDepositRouter.sol)
(deployed at
[`0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f`](https://celoscan.io/address/0x27fed876dbc44bf4d4ec7d1ccffe1b60fa09ff4f#code))
for every user whose Auto-Save plan is currently eligible for a cycle.

## This is a convenience, not a trust requirement

`depositFor` is deliberately **permissionless** — anyone can call it, and the
contract itself enforces that a deposit can only happen for the exact plan
amount, at or after `nextExecutionTime` (see the contract's own doc
comments). If this keeper is down, delayed, buggy, or simply never deployed,
the worst case is a **missed cycle**, never an incorrect one:

- Any user can trigger their own eligible cycle immediately from the
  Auto-Save UI's "Deposit now" button (visible whenever `isEligibleNow` is
  true — see `useAutoDeposit.ts`).
- Anyone else — another keeper, a script, a curious third party — can call
  `depositFor(user, amount)` directly with the exact values read from
  `plans(user)`. There's nothing keeper-specific about the call; this
  service just automates it.

This is a deliberate design property, not an afterthought: the router does
not depend on CeloSave's infrastructure staying up.

## What it does, each run

1. Reads its last-scanned block from local state.
2. Scans `PlanSet` logs from the router since that block, in bounded chunks,
   to discover any new user addresses (there's no on-chain enumerable list
   of users — this is the only way to learn who might have a plan).
3. For every known user, reads `plans(user)` **live** from the contract —
   this is the only thing eligibility is actually decided from. The
   log-derived address list is a discovery cache, never trusted for state.
4. For every plan with `active == true` and `block.timestamp >=
   nextExecutionTime`, calls `depositFor(user, monthlyAmount)`, sequentially
   (never in parallel — a single keeper wallet sending concurrent
   transactions risks nonce collisions).
5. Logs a structured summary (users scanned, deposits succeeded / reverted /
   errored) and a per-deposit audit row in the `keeper_deposit_log` SQLite
   table (Railway logs rotate; this table doesn't).

## The keeper wallet never holds user funds

`KEEPER_PRIVATE_KEY` controls a wallet that only ever does one thing: pay its
own CELO gas to call the permissionless `depositFor`. It:

- Never receives, custodies, or is approved to spend any user's cUSD. The
  router pulls funds via `transferFrom(user, ...)` using the allowance the
  *user* granted directly to the router contract — the keeper wallet is not
  a party to that allowance at all.
- Must **never** be the same key as `TREASURY_ADDRESS` or any wallet that
  holds protocol or user funds. `assertKeeperConfigSafe()` in
  `src/lib/config-guard.ts` doesn't enforce this programmatically (it can't
  know your other key's identity), so this is a manual operational rule —
  use a fresh wallet, seeded with a small CELO balance for gas only.
- Needs a top-up of native CELO periodically. The keeper logs a `LOW GAS
  WARNING` when the balance drops under ~1 CELO; there is currently no
  automated top-up.

## Environment variables (keeper-specific)

| Variable | Purpose |
|---|---|
| `AUTO_DEPOSIT_ROUTER_ADDRESS` | The deployed router: `0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f` |
| `KEEPER_PRIVATE_KEY` | Gas-only wallet, see above. Never commit this. |
| `ALCHEMY_API_KEY` | Already used by the main backend service — same RPC. |

`src/keeper.ts` refuses to run (throws before doing anything) if any of
these are missing — see `assertKeeperConfigSafe()`.

## Running locally

```bash
cd packages/backend
pnpm keeper:dev     # ts-node-dev, one-shot (no --respawn — it's meant to exit)
```

## Running in production build

```bash
pnpm build           # compiles src/keeper.ts -> dist/keeper.js, same as index.ts
pnpm keeper          # node dist/keeper.js
```

## Deploying as a Railway Cron Job

The existing `railway.json` at the repo root configures the always-on web
service (`index.ts` via `packages/backend/Dockerfile`). The keeper is a
**separate Railway service** in the same project, sharing the same repo and
Dockerfile but with a different start command and a cron schedule instead of
always-on deploy:

1. In the Railway project, **New Service → GitHub Repo** (same repo).
2. **Do not just set the start command in the UI.** The repo root has a
   `railway.json` (config-as-code) that already sets `startCommand: node
   packages/backend/dist/index.js` for the web service. Config-as-code takes
   precedence over UI settings, and both services point at the same repo —
   so a UI-only start command override on the keeper service gets silently
   ignored, and the keeper service ends up booting the web server instead
   of the keeper (this happened on first deploy: the crash trace showed
   `dist/index.js` running, demanding `TREASURY_ADDRESS`, a web-only var the
   keeper doesn't need — see `assertKeeperConfigSafe` vs.
   `assertProductionConfigSafe` in `src/lib/config-guard.ts`, which are
   deliberately separate for exactly this reason).

   Instead, add a second config-as-code file, e.g. `railway.keeper.json`, at
   the repo root:
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "DOCKERFILE",
       "dockerfilePath": "packages/backend/Dockerfile"
     },
     "deploy": {
       "startCommand": "node packages/backend/dist/keeper.js"
     }
   }
   ```
   No `healthcheckPath` or `restartPolicy` — this is a run-to-completion
   cron job, not an always-on service; those fields are web-service-only
   concerns. Point the keeper service's **Settings → Config-as-code Path**
   at this file. Confirm from the service's build/deploy logs that it's
   actually reading `railway.keeper.json`, not silently falling back to the
   root `railway.json` again.
3. Set the service's build to use `packages/backend/Dockerfile` (same as the
   web service) — this comes from the config-as-code file above, not a
   separate UI step.
4. Under the service's **Settings → Cron Schedule**, set a schedule. A
   reasonable default is every 30 minutes:
   ```
   */30 * * * *
   ```
   Plans are monthly-cadence, so this isn't time-critical to the minute —
   pick a cadence that bounds RPC/gas cost to a level you're comfortable
   with. Railway starts a fresh container per scheduled run and expects it
   to exit, which is exactly what `src/keeper.ts` does (`process.exit(0)` on
   success, `process.exit(1)` on a fatal error so Railway's run history
   shows the failure).
5. Set the three env vars above on this service specifically (Railway
   service env vars are per-service, not shared automatically with the web
   service).
6. Give the keeper wallet a small CELO balance before the first scheduled
   run.

Railway's cron UI has changed shape before — double check
[Railway's current cron docs](https://docs.railway.com) at setup time if
anything above doesn't match what you see in the dashboard.

## Observability

- Every run logs a one-line summary: blocks scanned, new users found,
  eligible plans, and a succeeded/reverted/errored breakdown.
- Every individual `depositFor` attempt is written to `keeper_deposit_log`
  (same SQLite file as the main service's `airtime_payments` /
  `analytics_payments` tables — see `src/lib/db.ts`).
- A "LOW GAS WARNING" line fires at the top of any run where the keeper
  wallet's CELO balance is under ~1 CELO.

## Known limitations / possible follow-ups

- **Sequential sends.** At real scale (many hundreds of eligible users in
  one run), sequential `depositFor` calls could make a single cron
  invocation slow. Not a problem at current scale; if it becomes one, the
  fix is bounded concurrency (e.g. a small worker pool), not full
  parallelism — nonce management still needs care.
- **No multicall batching for `plans()` reads.** Each known user is read
  individually. Fine at current user counts; a `multicall3` batch read would
  cut RPC round-trips if the user base grows substantially.
- **A Railway Volume at the keeper service's `DB_PATH` is required, not
  optional.** This used to be framed as a nice-to-have ("slower but never
  incorrect") — that stopped being true once `LOG_SCAN_CHUNK_BLOCKS` dropped
  to `10n` to fit Alchemy's free-tier `eth_getLogs` range cap (see the
  `LOG_SCAN_CHUNK_BLOCKS` comment in `router-keeper.ts`). Railway Cron Jobs
  start a fresh container per scheduled run; without a volume mounted at
  `DB_PATH` (see `src/lib/db.ts`), `keeper_state`'s cursor resets every run,
  and `scanForNewUsers` re-scans the router's *entire* history from
  `ROUTER_DEPLOY_BLOCK` every single time — at 10 blocks per call, that's
  already several thousand sequential `eth_getLogs` requests per run as of
  this writing, and it grows by roughly 1,700 more every day. That risks
  blowing through free-tier rate limits and single-run execution time on
  its own, independent of the range-cap issue that prompted the chunk-size
  fix. Mount the volume before relying on this in steady state. It does not
  need to be (and arguably shouldn't be) the same volume as the web
  service's — the two don't share any state that needs to stay in sync.
  Eligibility itself is still always re-verified live against the contract
  regardless of cursor state (see step 3 above) — a missing volume can
  cause redundant scanning or a slow/rate-limited run, never an incorrect
  deposit.
- **One-time backfill cost.** The first run after the volume is mounted
  still has to scan from `ROUTER_DEPLOY_BLOCK` forward once — at 10 blocks
  per call, expect on the order of thousands of sequential requests for
  that single run. Every run after that only covers the blocks since the
  last tick (a few dozen requests at a 30-minute cadence), because the
  cursor will actually persist. Watch that first run's duration in case it
  approaches a Railway execution-time ceiling.
