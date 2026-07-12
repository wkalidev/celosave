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

Required — `src/keeper.ts` refuses to run (throws before doing anything) if
any of these are missing, see `assertKeeperConfigSafe()`:

| Variable | Purpose |
|---|---|
| `AUTO_DEPOSIT_ROUTER_ADDRESS` | The deployed router: `0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f` |
| `KEEPER_PRIVATE_KEY` | Gas-only wallet, see above. Never commit this. |
| `ALCHEMY_API_KEY` | Used for the funds-adjacent calls: `plans()` reads, `depositFor` sends, receipt waits. |

Optional — all have working defaults, not enforced by `assertKeeperConfigSafe()`:

| Variable | Purpose | Default |
|---|---|---|
| `KEEPER_LOG_SCAN_RPC_URL` | RPC used only for `scanForNewUsers`'s discovery scan (`getBlockNumber`/`getLogs`) — deliberately separate from `ALCHEMY_API_KEY` so this service's highest-volume traffic doesn't compete with the funds-adjacent calls' budget. See "Why discovery uses a separate RPC" below. | `https://forno.celo.org` |
| `KEEPER_LOG_SCAN_DELAY_MS` | Pause between consecutive `eth_getLogs` calls during a scan, to stay under the RPC's sustained burst-rate limit (not just its per-call range cap — see "Two different RPC limits" below). | `400` |
| `KEEPER_MAX_BLOCKS_PER_RUN` | Ceiling on how many blocks a single run's discovery scan will cover, regardless of how large the backlog since the last cursor has grown. | `3000` |

### Two different RPC limits, not one

Getting a stable scan required fixing two independent constraints, discovered
one after the other:

1. **Per-call range cap.** Alchemy's free tier rejects any single
   `eth_getLogs` call spanning more than 10 blocks (`InvalidRequestRpcError`).
   Fixed by `LOG_SCAN_CHUNK_BLOCKS = 10n` in `router-keeper.ts`.
2. **Sustained burst-rate cap.** Even with every call correctly sized, firing
   hundreds or thousands of them back-to-back with no pacing still triggers
   429s — observed at ~3.3K CU/s against a 500 CU/s limit, a rate problem
   with plenty of monthly quota left (4% used), not a budget problem. Fixed
   by `KEEPER_LOG_SCAN_DELAY_MS` pacing between calls, plus
   `KEEPER_MAX_BLOCKS_PER_RUN` bounding how many calls one run can possibly
   make in the first place.

### Why discovery uses a separate RPC

`scanForNewUsers` is both the highest-volume thing this keeper does and the
one part of it that's fine to degrade gracefully — a missed or incomplete
scan means a missed cycle, never an incorrect deposit (see the "This is a
convenience, not a trust requirement" section above). Routing it through
`KEEPER_LOG_SCAN_RPC_URL` (Celo's public full node by default — already used
elsewhere in this repo for `verify:aave-reserve`, see the root README) keeps
its volume off the Alchemy budget the funds-adjacent calls
(`plans()` reads, `depositFor` sends, receipt waits) depend on, and means a
bad day on the public endpoint doesn't affect triggering deposits for users
already discovered.

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
5. Set the three required env vars above on this service specifically
   (Railway service env vars are per-service, not shared automatically with
   the web service). The optional ones have working defaults and don't need
   to be set unless you want to override them.
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
  optional — and `KEEPER_MAX_BLOCKS_PER_RUN` changes what "not optional"
  means in practice.** Railway Cron Jobs start a fresh container per
  scheduled run; without a volume mounted at `DB_PATH` (see `src/lib/db.ts`),
  `keeper_state`'s cursor resets every run. Before the per-run cap existed,
  that meant an ever-growing full-history rescan every single run — slow,
  and eventually rate-limited on its own. With the cap in place, a single
  run is now always bounded (at most `KEEPER_MAX_BLOCKS_PER_RUN` blocks,
  ~300 `eth_getLogs` calls at the default), so it can no longer crash or
  time out a run by itself. But without a persisted cursor, that bounded
  scan re-covers the *same* first `KEEPER_MAX_BLOCKS_PER_RUN` blocks after
  `ROUTER_DEPLOY_BLOCK` on every run, forever — discovery effectively
  freezes at that window and never reaches any user whose `PlanSet` lands
  later. (They can still always trigger their own deposit from the UI —
  see "This is a convenience, not a trust requirement" above — so this is a
  missed-discovery risk, never an incorrect-deposit risk.) Mount the volume
  so multi-run progress actually accumulates. It does not need to be (and
  arguably shouldn't be) the same volume as the web service's — the two
  don't share any state that needs to stay in sync.
- **Backfill takes multiple runs by design, not one.** The first run after
  the volume is mounted covers only the first `KEEPER_MAX_BLOCKS_PER_RUN`
  blocks after `ROUTER_DEPLOY_BLOCK` (or after the persisted cursor,
  whichever is later) — deliberately, so no single run risks a long
  duration or a rate-limit burst regardless of how large the total backlog
  has grown. Catching up on a multi-day backlog takes several runs, each
  covering the next bounded chunk, until the cursor reaches the chain tip;
  after that, steady-state runs only cover the blocks since the last tick
  (well under the cap). Raise `KEEPER_MAX_BLOCKS_PER_RUN` if you want fewer,
  larger catch-up runs — just keep in mind each run's wall-clock time scales
  with it (~ `blocks / 10 * KEEPER_LOG_SCAN_DELAY_MS`), and shouldn't
  approach the cron cadence or Railway's execution-time ceiling.
