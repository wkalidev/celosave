# CeloSave Revenue Proposals

This is the full monetization options list, re-delivered after the original
version was lost to a context compaction earlier in this engagement.
Re-derived from a fresh audit of the actual code rather than reconstructed
from memory, so it reflects what's really implemented today, not what was
merely discussed.

## What's actually live today

A repo-wide check of every fee-related constant found three real, enforced
revenue mechanisms — and one gap worth fixing (see below).

| Mechanism | Rate | Where enforced | Status |
|---|---|---|---|
| Auto-Save router fee | 25 bps (0.25%) of each cycle's gross deposit | `CeloSaveAutoDepositRouter.sol`, on-chain, immutable | **Live** — deployed at `0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f` |
| Bill-pay markup | 150 bps (1.5%) on airtime top-ups | `packages/backend/src/routes/airtime.ts` (`MARKUP_BPS`) | **Live** |
| Analytics x402 API | $0.001 USDC per request | `packages/backend/src/routes/analytics.ts` | **Live** |

The Auto-Save fee is hard-capped at 100 bps in the contract itself and
cannot be raised post-deployment — see `docs/security-report.md` §6 for
the full design reasoning. The 25 bps chosen leaves headroom (a future v2
router could launch at a different rate for new subscribers) but the
currently-deployed router's rate is permanent for anyone on it.

## A gap found while re-auditing for this list

`packages/backend/src/services/protocol-stats.ts` declares a `fees` object
in its public (paid, x402-gated) API response:

```ts
fees: {
  yieldBps: 30,
  billPayBps: 150,
},
```

`billPayBps: 150` is accurate — it matches `airtime.ts`'s real markup.
**`yieldBps: 30` is not backed by any actual fee-taking code.** The Save
flow (`useDeposit.ts`/`useWithdraw.ts`) supplies 100% of a deposit to Aave
and returns 100% of the balance on withdrawal — there is no 30 bps (or any)
skim anywhere in that path. This means the paid analytics API is currently
telling anyone who pays for it that a fee exists which isn't actually
collected. This should be resolved one of two ways before it's relied on
for any partner-facing or investor-facing claim:

- **Implement it** (see Option 1 below), or
- **Remove the false claim** from the API response — a five-minute fix if
  Option 1 isn't prioritized soon.

## Proposed options

### 1. Actually implement the declared Save-flow yield fee

Take a small bps skim on **yield only** (not principal) when a user
withdraws from the plain Save flow (USDT/USDC/cUSD → Aave), closing the gap
above.

- **Pros:** Recurring revenue proportional to real value generated for the
  user (a performance-fee model, not a flat tax on savings); matches what's
  already publicly declared, so implementing it is arguably "finishing" a
  feature rather than adding a new one.
- **Cons:** The Save flow currently has *no CeloSave contract in the path
  at all* — `useDeposit`/`useWithdraw` call Aave's `Pool` directly from the
  user's wallet. Taking a fee would require either (a) a new on-chain
  router analogous to the Auto-Save one (real engineering effort, another
  audit surface), or (b) skimming client-side / off-chain before or after
  the Aave call, which is easy to bypass and doesn't hold up as a real
  enforced fee the way the Auto-Save router's on-chain skim does. Principal
  tracking today is also client-side (`localStorage`, per
  `savings-store.ts`, with an explicit fallback for users whose deposit
  predates tracking) — not a reliable enough source of truth to compute a
  precise yield-based fee against.
- **Cost:** Medium–high if done properly (new contract + audit trail
  matching the rigor this session put into the Auto-Save router); low if
  the near-term choice is just to remove the false claim instead.

### 2. Auto-Save v2 router at a different fee rate

Once volume justifies it, deploy a second, equally-immutable router at a
higher (still ≤100 bps) fee for new subscribers, while the existing router
keeps serving its current users at 25 bps forever (it cannot be changed —
that's the point of it being immutable).

- **Pros:** No risk to existing users' terms; straightforward to reason
  about since each router is independently simple.
- **Cons:** Fragments TVL and integration surface across two router
  addresses; frontend needs to know which router a given user is on;
  doesn't help until there's enough Auto-Save volume for the rate
  difference to matter.
- **Cost:** High — full contract deployment + the same test/verify rigor as
  the first router, plus frontend routing logic. Not recommended near-term;
  worth revisiting once Auto-Save TVL is material.

### 3. Premium per-wallet analytics via x402

Extend the existing, already-proven x402 analytics API
(`GET /api/analytics/protocol`, currently protocol-wide stats only) to
offer per-wallet analytics — historical yield earned, deposit/withdrawal
history, CSV export — priced per request or as a small subscription, same
payment mechanism already live.

- **Pros:** Reuses a payment rail that's already built, tested, and live;
  low marginal infra cost per request; plausible interest from anyone
  building on top of CeloSave data (accountants, other Celo apps,
  dashboards).
- **Cons:** Needs real historical/time-series data CeloSave doesn't
  currently store (today's balances are point-in-time on-chain reads, not
  logged over time) — a new indexer or scheduled snapshot job would be
  required; no confirmed demand yet.
- **Cost:** Medium — mostly data-pipeline work, not new payment
  infrastructure.

### 4. Bill-pay margin improvement (no user-facing price change)

Negotiate better wholesale airtime rates with Africa's Talking / Zendit at
volume, and either keep the improved spread as extra margin beyond the
existing 150 bps markup, or pursue carrier referral/affiliate arrangements.

- **Pros:** Doesn't touch what users see or pay at all — pure margin
  improvement; no new code path, no new audit surface.
- **Cons:** This is a business-development lever, not an engineering one —
  revenue depends on relationship negotiation and volume, not a code
  change; timeline is outside CeloSave's own control.
- **Cost:** Low engineering cost; real non-engineering effort required.

### 5. Grant funding and MiniPay ecosystem placement

Not a per-transaction fee at all, but worth stating plainly as a nearer-term
lever than usage-based fees: pursue Celo/Opera ecosystem grants and
MiniPay's official featured-placement or app-store programs. This is
already the active strategy this session's other deliverable (the security
report) is explicitly built to support ("used for MiniPay review and grant
applications"). For a savings app, usage-fee economics at 25–150 bps take
real TVL and volume to become material; grant funding is a more realistic
near-term revenue/runway source while that TVL builds.

- **Pros:** Doesn't require any new code; directly supported by work
  already done this session (security report, verified deployment, live
  smoke test).
- **Cons:** Not recurring/compounding the way a fee is; competitive,
  application-dependent, no guaranteed outcome or timeline.
- **Cost:** Low engineering cost (mostly already-produced artifacts);
  real effort in the application/relationship process itself.

### 6. Third-party keepers running the same fee-generating call — a structural point, not a new mechanism

Worth calling out explicitly because it changes how "SDK for third-party
integrators" (a separate open item — see the SDK assessment delivered
alongside this) should be thought about from a revenue angle: **the 25 bps
Auto-Save fee is collected by the contract itself, regardless of who calls
`depositFor`.** CeloSave's own keeper, a user triggering their own cycle,
or a completely unrelated third party's keeper all produce the exact same
fee to the exact same `FEE_RECIPIENT`. This means publishing tooling that
makes it easier for third parties to run their own keepers is not a
revenue give-away — it's free redundancy for CeloSave's own infrastructure
with no change to fee capture. Not an action item on its own, but relevant
context for evaluating the SDK question and for describing the
permissionless design's economics accurately in any pitch material.

## Summary

Two of three live mechanisms are solid and already collecting revenue with
no changes needed (Auto-Save router fee, bill-pay markup). The analytics
x402 API is live but currently only monetizes protocol-wide data — Option 3
is the most direct way to grow revenue from what's already built. Option 1
(closing the declared-but-not-collected 30 bps Save-flow fee gap) is the
most urgent from an integrity standpoint — either build it for real or stop
claiming it — but is the most expensive option here if built properly,
since the plain Save flow currently has no CeloSave contract in its path at
all. Options 2 and 4 are real but not near-term. Option 5 is arguably the
most realistic source of near-term funding given current TVL.
