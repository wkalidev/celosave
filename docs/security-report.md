# CeloSaveAutoDepositRouter — Security Report

**Contract:** `CeloSaveAutoDepositRouter`
**Deployed address:** [`0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f`](https://celoscan.io/address/0x27fed876dbc44bf4d4ec7d1ccffe1b60fa09ff4f#code) (Celo mainnet, chain ID 42220)
**Deployment block:** 71,726,465 (2026-07-09)
**Source:** `packages/contracts/src/CeloSaveAutoDepositRouter.sol`
**Constructor args (decoded from the deployment transaction):** `cUSD = 0x765DE816845861e75A25fCA122bb6898B8B1282a`, `PoolAddressesProvider = 0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5`, `feeBps = 25` (0.25%), `feeRecipient = 0x3AC95343494979d0c92195D387D278DCb3d6d595` (protocol treasury)
**Prepared by:** Claude, working session with wkalidev, covering design, implementation, review, and testing of this contract and its supporting infrastructure. This is not a third-party or professional audit firm's report — see "Scope and limitations" at the end.

This document consolidates the threat model, design decisions, and the audit
trail from the sessions that produced this contract, for use in MiniPay
review and grant applications.

---

## 1. What this contract does

Auto-Save lets a user schedule a fixed monthly cUSD deposit into their own
Aave V3 position, without giving up custody of their funds at any point. The
router is the only new on-chain component this required; everything else
(Aave's Pool, cUSD, the user's own wallet) is infrastructure that already
existed and is not controlled by CeloSave.

A user:
1. Grants the router a **capped, revocable** cUSD `approve()` — the real,
   contract-enforced ceiling on total funds ever movable.
2. Calls `setPlan(monthlyAmount, interval)` — an on-chain record of the
   *rate* at which funds may move (amount per cycle, minimum time between
   cycles).
3. From then on, anyone can call `depositFor(user, amount)` to execute one
   eligible cycle: it pulls exactly `amount` from the user (must equal the
   plan's `monthlyAmount`), takes an optional fee, and supplies the rest to
   Aave `onBehalfOf` the user — aTokens land directly in the user's wallet.

## 2. Custody model

**The router never holds cUSD at rest.** Every unit of cUSD it ever receives
via `transferFrom` is forwarded onward — to `FEE_RECIPIENT` and/or to Aave's
`Pool.supply()` — within the same atomic transaction that received it. There
is no code path that leaves a balance sitting in the contract between calls.
This is the property that makes the one-time `approve(pool, type(uint256).max)`
issued at construction (see §4) safe: an unlimited *allowance from the
router to Aave* is not the same risk as an unlimited *allowance from a user
to the router* would be, because the router is never carrying a balance for
that allowance to expose.

Two independent, user-controlled ceilings must **both** hold for any funds
to move at all:

| Ceiling | What it bounds | Who controls it | How it's revoked |
|---|---|---|---|
| ERC20 allowance (`cUSD.allowance(user, router)`) | Total cumulative amount ever pullable | The user, via their own wallet | `approve(router, 0)` — one transaction, no CeloSave involvement |
| On-chain `Plan` (`plans(user)`) | Per-cycle amount + minimum cadence | The user, via `setPlan`/`cancelPlan` | `cancelPlan()` — one transaction |

A caller of `depositFor` — permissioned or not — cannot exceed either
ceiling. This is why the trigger can safely be permissionless (§5): the
contract's own state, not caller identity, is what limits fund movement.

This replaced an earlier Superfluid CFA-streaming design that was
**custodial** — streamed funds sat in a CeloSave-controlled address with no
mechanism to actually earn yield in the user's name. That design was
identified as a fundamental flaw during this engagement's design review and
was rejected before any of it was deployed; it has been fully removed from
the codebase (not left in as dead code).

## 3. Reentrancy

A hand-rolled, minimal reentrancy guard (`nonReentrant`, lines 114–125) wraps
`depositFor`. Checks-effects-interactions ordering is also followed
independently of the guard: `plan.nextExecutionTime` is updated (effects)
*before* any external call (`transferFrom`, `transfer`, `supply` —
interactions), so even a hypothetical guard bypass would still see the
schedule already advanced by the time any external call could re-enter.

cUSD is a standard ERC20 with no transfer hooks, so there is no known
reentrancy vector via the token itself today. The guard is defense-in-depth
against that assumption changing or being wrong, at near-zero gas cost — not
a response to an identified live vector.

**Test coverage:** `test/CeloSaveAutoDepositRouter.unit.t.sol` includes a
`ReentrantMockERC20` specifically built to attempt a reentrant call during
`transferFrom`, proving the guard reverts it.

## 4. Aave integration and the Pool-approval design

The router resolves `AAVE_POOL` once, at construction, via the official
`PoolAddressesProvider.getPool()` — the same indirection pattern Aave's own
SDKs use — rather than trusting a hardcoded Pool address. This was a
deliberate choice discussed and confirmed during design review, closing off
the possibility of the constructor being deployed against a stale or wrong
Pool address.

The router issues **one** `approve(pool, type(uint256).max)` in the
constructor and never approves again. This was evaluated against the
alternative (re-approving the exact amount on every `depositFor` call) and
chosen because it's cheaper per cycle and, per §2, does not introduce a
custody risk — the router never holds a balance for that allowance to be
exploited against.

**Feasibility was verified, not assumed.** Before any contract code was
written against it, cUSD's Aave V3 Celo reserve was confirmed live via two
independent methods: (a) Blockscout data showing the aToken (`aCelcUSD`)
with hundreds of real holders and real circulating supply — i.e. `supply()`
has already succeeded on this exact reserve many times — and (b) a
purpose-built pre-deployment gate script,
`scripts/verify-aave-reserve.mjs`, that performs live `eth_call`s against
`IPoolDataProvider` to check the reserve is active, not frozen, not paused,
and has supply-cap headroom, plus cross-resolves the Pool address three
independent ways (`PoolAddressesProvider.getPool()`, the hardcoded
constant, and the aToken's own `POOL()`) and requires them to agree. This
script is designed to be re-run before any future redeployment; it was run
successfully against live `forno.celo.org` before this deployment (active
reserve, ~595k token supply-cap headroom at the time).

## 5. Permissionless trigger — the core safety argument

`depositFor` has no access control. This is intentional, not an oversight,
and it is the design decision this report spends the most words on because
it's the one most likely to draw scrutiny.

**Why it's safe:** a permissionless function is only dangerous if the
caller's identity is doing safety work that the function's own logic isn't.
Here, it isn't:

- `amount == plan.monthlyAmount` — a caller cannot cause any amount other
  than what the user themselves configured to move.
- `plan.active` — a cancelled or never-created plan cannot be triggered by
  anyone, ever.
- `block.timestamp >= plan.nextExecutionTime` — a caller cannot cause a
  cycle to run early, no matter how many times or how fast they call.

Every one of those three checks is enforced by contract state that only the
*user* can set (via `setPlan`/`cancelPlan`), not by anything the caller
supplies or controls beyond restating the already-fixed amount. A malicious
or buggy caller can, at worst, do nothing (every call outside the eligible
window simply reverts) or do exactly what the user already authorized
(pull the user's own configured amount, once, on or after the scheduled
time) — there is no third option.

**Why it's permissionless on purpose, not by omission:** this was an
explicit requirement set during design review — "permissionless, but ONLY
with on-chain schedule enforcement" — specifically so the product does not
depend on CeloSave's own infrastructure staying up. If CeloSave's backend
keeper (§8) is down, delayed, or shut down entirely, any user can trigger
their own eligible cycle directly from the UI, and any third party can run
an equivalent script against the same public function. The fee (§6) is
captured by the contract regardless of who calls it, so this also isn't a
revenue risk — a third-party caller does the same work CeloSave's keeper
would have done, and the same 25 bps still lands in `FEE_RECIPIENT` either
way.

## 6. Fee mechanism

An optional protocol fee, in basis points, set once at construction and
never changeable afterward:

- `MAX_FEE_BPS = 100` (1%) is a compile-time constant hard ceiling — not a
  variable, not settable by anyone including the deployer. The constructor
  reverts (`"fee too high"`) if `feeBps` exceeds it.
- The deployed fee is **25 bps (0.25%)**, well under the ceiling.
- The fee is taken **out of** the gross amount, not added on top — a user
  with a 50 cUSD/month plan always sees exactly 50 cUSD leave their wallet;
  the fee is a slice of that 50 (`fee = amount * FEE_BPS / 10_000`), and
  `netAmount = amount - fee` is what actually reaches Aave on the user's
  behalf. This was a deliberate choice so the number a user configures in
  the UI is the number that leaves their wallet, with no surprise add-on.
- `FEE_RECIPIENT` is immutable, fixed at deployment to the protocol
  treasury (`0x3AC95343494979d0c92195D387D278DCb3d6d595`) — the same
  address already used for bill-pay markup revenue.

**Fix applied before deployment:** the fee mechanism was flagged as
*missing entirely* in an earlier draft of this contract during design
review (the draft only implemented the deposit-and-supply flow, with no fee
skim at all). It was added, tested for both the zero-fee and nonzero-fee
cases, and is what's live in the deployed contract.

## 7. Schedule math — anchoring and the catch-up bug

`nextExecutionTime` is advanced by `plan.nextExecutionTime + interval`
(anchored to the *previous* schedule), not by `block.timestamp + interval`
(anchored to *now*). This matters: if it were anchored to now, a keeper
that's consistently a little late every cycle would cause the effective
cadence to drift progressively later over time, cycle after cycle.
Anchoring to the previous slot keeps the cadence honest even if execution
timing is imprecise.

**A real bug was caught and fixed here during design review.** The first
version of this logic (`nextExecutionTime += interval`, unconditionally)
allowed missed cycles to accumulate: if a plan went unclaimed for, say, six
months, the very next eligible call would find `nextExecutionTime` far in
the past, add one interval, land still in the past, and — depending on how
the eligibility check was written — could open the door to a burst of
back-to-back catch-up deposits rather than exactly one. The fix, present in
the deployed contract:

```solidity
uint256 next = uint256(plan.nextExecutionTime) + plan.interval;
if (next <= block.timestamp) {
    next = block.timestamp + plan.interval;
}
plan.nextExecutionTime = uint64(next);
```

If the anchored slot is still at or before now (i.e. one or more whole
cycles were missed), it's clamped forward to `block.timestamp + interval`
instead. The result: **a gap of any length — one missed cycle or twenty —
still only ever permits exactly one catch-up deposit**, and the next call
after that is not eligible until a full interval later. A dedicated test
(`test_sixMonthGapAllowsExactlyOneDeposit` in the fork suite) exists
specifically to prove this.

The reentrancy guard also incidentally makes two calls in the same block
impossible even before this fix: the second call would see
`nextExecutionTime` already pushed forward by the first.

## 8. The keeper is a convenience, not a trust dependency

`packages/backend/src/keeper.ts` and `src/services/router-keeper.ts`
implement a Railway cron job that scans for known users and calls
`depositFor` on their behalf when eligible. Its design follows directly
from §5:

- The keeper wallet (`KEEPER_PRIVATE_KEY`) **only ever pays its own CELO gas
  to call the permissionless `depositFor`.** It never receives, custodies,
  or is approved to move any user's cUSD — the router pulls funds via the
  allowance the *user* granted directly to the router, and the keeper
  wallet is not a party to that allowance at all.
- Before triggering anything, the keeper always re-reads `plans(user)`
  **live** from the contract. A local log-derived cache of "which addresses
  have ever set a plan" (there's no on-chain enumerable user list, so
  scanning `PlanSet` logs is the only way to discover candidates) is never
  trusted for eligibility — only for discovery. A stale or incomplete local
  cache can cause a missed cycle (caught on the next scan); it cannot cause
  an incorrect one, because the final eligibility decision always comes
  from a fresh contract read.
- Network-level failures (RPC hiccups, timeouts) are retried with backoff;
  an on-chain revert is not retried (it's deterministic — retrying only
  burns more gas for the same outcome) and is simply left for the next
  scheduled scan's fresh eligibility check.
- If the keeper is down entirely, §5 already covers the fallback: any user
  or any third party can trigger an eligible cycle directly.

See `packages/backend/KEEPER.md` for the full operational runbook.

## 9. Mock-fidelity bug (unit test suite, not the contract)

During test development, the real Foundry unit suite (run on the engineer's
own machine — this sandbox cannot execute Foundry against a Celo fork; see
`packages/contracts/README.md` for the specific upstream Foundry issue) came
back 13/14 passing, with `test_depositForSplitsFeeAndNetCorrectly` failing:
the router appeared to retain a nonzero balance after a deposit, which would
have contradicted the entire custody model in §2 if it were real.

Root-caused to the test's `MockAavePool`, not the contract: the mock
recorded bookkeeping for a `supply()` call but never actually called
`transferFrom` to pull the tokens — unlike the real Aave `Pool.supply()`,
which does. This let the router's net-of-fee balance sit stranded in the
*mock* environment only. Fixed by making `MockAavePool.supply()` actually
call `transferFrom(msg.sender, address(this), amount)`, matching real
Aave's behavior; `MockERC20`'s allowance-decrement logic was independently
checked for the same class of gap and found correct. Suite re-run:
**14/14 passing**, including the now-restored
`assertEq(cusd.balanceOf(address(router)), 0, ...)` zero-residual-balance
assertion — the single most important invariant in the suite, since it's
the direct test of the non-custodial claim in §2.

This is flagged explicitly here because "a test suite that was wrong in the
contract's favor" and "a test suite that was wrong against the contract"
are very different findings, and the distinction matters for anyone
evaluating this report: the bug was in test tooling fidelity, not in the
contract's actual token-handling logic, and the fix made the test suite
*more* strict, not more lenient.

## 10. No admin, no upgrade path — verified, not just claimed

There is no owner, no admin-only function, no pause switch, and no proxy /
upgrade mechanism anywhere in this contract. Every state variable that
could plausibly need "fixing" post-deployment (`CUSD`, `AAVE_POOL`,
`FEE_BPS`, `FEE_RECIPIENT`) is `immutable`, set only in the constructor.
`MIN_INTERVAL` and `MAX_FEE_BPS` are compile-time `constant`s. There is no
function in the contract, checked line by line, that writes to any of
these after construction. A dedicated unit test
(`test_routerHasNoAdminFunctionSurface` in the unit suite) documents this
as an explicit, checked property rather than leaving it as an implicit
claim.

The practical consequence: if a bug were ever found post-deployment, there
is no lever anyone — including the deployer — can pull to change this
contract's behavior. The only remedy would be a new contract deployment and
a migration, same as for any other immutable contract. This is a deliberate
tradeoff (simplicity and trust-minimization over patchability) made
explicitly during design review, not a limitation discovered after the
fact.

## 11. Address-checksum discipline (carried over from the broader app audit)

Not specific to this contract, but relevant to the same engagement's
security posture: an earlier pass over the frontend found and fixed an
EIP-55 checksum casing bug in the `TREASURY` constant (one character's case
was wrong — same address, same bytes, but it failed viem's strict
`address`-type validation, which would have made any Auto-Save transaction
touching that constant throw on its very first call). The fix was applied
at the source (`packages/app/src/lib/contracts.ts`), and regression tests
(`assertValidAddresses()` and its test coverage in `useAutoDeposit.test.ts`)
now exist specifically to catch this class of bug — a mistyped or
wrong-case address constant — before it reaches production, for every
address constant the Auto-Save flow depends on (router, cUSD).

## 12. Verified deployment, not just verified code

- **Compiled clean** via the project's configured solc (0.8.20).
- **Unit suite:** 14/14 passing (see §9).
- **`verify:aave-reserve`:** all checks passed against live `forno.celo.org`
  — cUSD reserve active, not frozen, not paused, resolved Pool address
  matches the hardcoded constant and the aToken's own `POOL()`.
- **On mainnet, post-deployment:** a full smoke test was run against the
  live, deployed contract — `setPlan` and `depositFor` both executed on
  Celo mainnet, aTokens landed in the test user's own wallet (not
  CeloSave's), and the fee landed in the treasury address. This is the
  strongest evidence available that the custody model in §2 holds in
  practice, not just on paper.
- **Verified source on Celoscan** (`#code` tab shows verified source at the
  deployed address, linked at the top of this document). Note: at the time
  of writing, Blockscout's independent indexer (`celo.blockscout.com`)
  had not yet marked the same address as verified — this is a separate
  service with its own indexing/verification pipeline and is a minor,
  cosmetic discrepancy, not a discrepancy in the on-chain bytecode itself
  (both explorers necessarily show the same deployed bytecode; only the
  "is a human-readable source on file" flag differs by service). Worth
  submitting source to Blockscout too for consistency, but doesn't affect
  anything in this report.

## 13. Scope and limitations of this report

This report was produced by an AI coding assistant (Claude) working
directly with the repository owner across several sessions covering
design, implementation, testing, and post-deployment verification of this
specific contract and its immediate supporting infrastructure (the keeper,
the deployment-gate script, and the frontend integration). It is **not** a
substitute for an independent third-party smart contract audit by a firm
that specializes in this. Specifically out of scope here:

- No formal verification was performed.
- No fuzzing/invariant testing beyond the hand-written unit and fork test
  cases described above.
- No review of Aave V3's own contracts, cUSD's own contract, or the
  PoolAddressesProvider — these are treated as trusted, already-audited
  external dependencies, which is standard practice but is itself an
  assumption worth stating plainly.
- No review of front-running / MEV considerations for `depositFor` calls
  specifically — a plausible follow-up given the permissionless design, but
  not something this engagement analyzed in depth. (Informally: front-
  running a `depositFor` call doesn't obviously benefit an attacker, since
  the amount and recipient are fixed by the victim's own plan and the
  supply lands in the victim's wallet regardless of who submits the
  transaction — but this claim has not been stress-tested the way a formal
  MEV review would.)

If this report is used in a grant or review context that requires a formal
third-party audit, that should be pursued separately; this document is best
read as a thorough, honest account of the design reasoning and the specific
issues that were found and fixed along the way, not as a replacement for
one.
