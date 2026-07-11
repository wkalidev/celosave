# Yield Fee Collection — Design Proposal (Archived, Not Implemented)

**Status: not built.** `protocol-stats.ts` declares `yieldBps: 0` and no fee
is collected on the plain Save flow. This document is the design that was
worked out when we considered building it, kept here so we don't re-derive
it from scratch when TVL justifies revisiting. Do not treat anything below
as implemented.

## Why this shipped as a decision to wait, not to remove the idea

The router-based mechanism below requires putting a new CeloSave contract
into the core deposit/withdraw path (currently a direct, contract-free call
to Aave's `Pool`), plus a new aToken-approval step on withdraw, plus a
migration function for existing depositors. That's real engineering and
real audit surface for revenue that, at current TVL, is on the order of
cents per year. Not worth the risk to the working core flow right now. The
call was: fix the honesty gap cheaply (zero the declared fee), keep this
design on file, revisit when the math changes — ideally bundled with
partial-withdraw support, since both touch the same files (see "Bundle with
partial withdraw" below).

## The constraint that shapes every option

The Save flow has no CeloSave contract in its path today —
`useDeposit.ts`/`useWithdraw.ts` call Aave's `Pool` directly from the user's
wallet. Principal is tracked only in `localStorage`
(`savings-store.ts:getPrincipal`/`addDeposit`), which a user can edit, lose,
or bypass by calling Aave directly outside the app.

Any yield-only fee — whether taken on withdraw or on a schedule — has to
know how much of a user's aToken balance is principal vs. earned yield.
**The only non-gameable way to know that is to have a CeloSave contract
witness the deposit itself.** A "tell the contract your principal" call is
exactly as gameable as trusting a client-side number: nothing stops someone
from reporting an inflated principal to erase their yield. So both options
considered below assume deposits move from a raw Aave call to a thin
CeloSave router that records `principal[user][asset] += amount` atomically
with the Aave supply call. That part isn't optional — it's the price of a
fee that's real rather than cosmetic.

## Option A — fee on full withdrawal, atomically, no keeper (recommended if/when built)

A router mirroring `CeloSaveAutoDepositRouter.sol`'s custody pattern:

- `deposit(asset, amount)` — pulls the token via `transferFrom`, records
  `principal[user][asset] += amount`, supplies to Aave `onBehalfOf` the
  user (aTokens land directly in the user's wallet, same as today — the
  router never holds a resting balance).
- `withdraw(asset, aToken)` — pulls the user's full aToken balance via
  `transferFrom` (requires a one-time aToken approval from the user — new
  step, same pattern as the existing pre-deposit ERC20 approval), withdraws
  it from Aave to itself, computes `yield = max(0, received -
  principal[user][asset])`, takes `fee = yield * 30 / 10_000`, forwards the
  fee to treasury and the rest to the user, then zeroes `principal` —
  atomic, one transaction, nothing left in the router afterward.

This works cleanly because the current UI only supports full withdrawal (no
partial-amount field), so there's no proration to get wrong. No cron, no
checkpoint, no drift.

**Net APY display:** `grossApy * (1 - 0.003)` next to a "Yield fee 0.30%"
tag — an approximation (the fee is a flat cut at withdrawal, not compounded
out of the rate), close enough at 30bps to note as an estimate in a
tooltip rather than claim exact.

## Option B — periodic skim via a keeper (rejected)

A "harvest" function would read each user's current aToken balance against
a stored checkpoint and skim `feeBps * (balance - checkpoint)` on a
schedule, advancing the checkpoint each time.

Rejected because there's no version of this that stays correct without
also touching withdraw: since withdrawals still happen directly against
Aave, a user withdrawing between harvests drops their balance below the
last checkpoint with no way for the collector to know a withdrawal
happened. The next harvest either clamps to zero (silently forgiving
whatever yield accrued since the last harvest) or the design has to hook
withdraw anyway to force a harvest first — at which point it's no longer
avoiding the withdraw-path change that was its main appeal, while carrying
extra keeper infrastructure and per-user-per-token checkpoint state on top.
Strictly more moving parts than A for a leakier result.

## Two decisions to make before building A

1. **Existing depositors.** Users who already deposited via the old
   direct-Aave path have no principal recorded in a new router. Proposed
   fix: a one-time `recordExistingBalance(asset)` a user can call exactly
   once (only if their recorded principal is still zero), which sets
   `principal[user][asset]` to their *current* aToken balance — past yield
   is grandfathered (never fee'd), only yield earned after this ships gets
   metered. This is a policy call as much as an engineering one — confirm
   grandfathering is still the right call whenever this is revisited,
   rather than assuming it.
2. **Old path retirement.** For the fee to be real rather than optional,
   `useDeposit.ts`/`useWithdraw.ts` need to stop calling Aave directly and
   target the new router instead — Aave has no way to know or care which
   path a caller uses, so leaving the old direct-call path live would let
   anyone route around the fee entirely.

## Bundle with partial-withdraw support

Worth doing together next time this comes up: partial withdrawal isn't
supported today (`withdraw-modal.tsx` only has a "Withdraw All" button),
and Option A's fee math leans on full-withdrawal-only to avoid principal
proration. Adding partial withdraw later would touch the same withdraw
hook and the same router contract this design already touches — building
both in one pass avoids doing the proration math twice. If partial
withdraw ships first (for reasons unrelated to fees), this design needs
revisiting: `yield = max(0, amountWithdrawn - proratedPrincipalPortion)`
rather than the simpler full-balance subtraction above.

## Scope estimate (as of this write-up)

New `CeloSaveRouter.sol` (deposit + withdraw + grandfather function, one
contract for all three tokens: USDT, USDC, cUSD), full Solidity test suite
mirroring the Auto-Save router's style (fee math, clamping, reentrancy,
no-admin-surface, grandfather-once), fork tests against real Aave,
rewritten `useDeposit.ts`/`useWithdraw.ts`, new approval-detection UX for
withdraw, frontend fee/APY display, frontend tests, deployment +
verification, README/security-report updates. Comparable in size to the
Auto-Save router workstream.

## Revisit trigger

Revisit when Save-flow TVL is large enough that 30bps/year is a meaningful
number rather than cents — at that point the audit/engineering cost below
is easily justified, and bundling with partial-withdraw (above) becomes the
efficient way to do both at once.
