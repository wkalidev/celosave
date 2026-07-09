# CeloSave Contracts

Foundry project (solc 0.8.20). Two contracts:

- `src/CeloSaveRegistry.sol` — records first-time users on-chain (Proof of Ship signal).
- `src/CeloSaveAutoDepositRouter.sol` — non-custodial recurring-deposit router for Auto-Save. Immutable, no owner/admin/upgrade path. See the contract's own doc comments for the full custody model; short version: a user grants it a capped, revocable cUSD allowance and an on-chain plan (amount + interval), and anyone can permissionlessly call `depositFor(user, amount)` to pull exactly that plan's amount and supply it to Aave V3 `onBehalfOf` the user — the router never holds cUSD at rest.

## Setup

```bash
cd packages/contracts
forge install foundry-rs/forge-std --no-commit   # lib/ is gitignored, not committed — reinstall after cloning
cp .env.example .env   # if present — otherwise create .env with CELO_RPC_URL and CELOSCAN_API_KEY
```

`CELO_RPC_URL` should point at any Celo mainnet (chainId 42220) RPC — e.g. `https://forno.celo.org`.

## Running tests

```bash
# RPC-independent unit tests (mocked ERC20 + mocked Aave pool) — always runnable:
forge test --match-path test/CeloSaveAutoDepositRouter.unit.t.sol -vvv

# Fork tests against real Celo mainnet Aave V3 + cUSD — see known issue below:
forge test --match-path test/CeloSaveAutoDepositRouter.fork.t.sol --fork-url "$CELO_RPC_URL" -vvv
```

### Known issue: fork tests currently panic on Foundry v1.7.x

`forge test --fork-url` against Celo mainnet currently panics during fork
instantiation on Foundry v1.7.x:

```
Message: Missing operator fee scalar for isthmus L1 Block
Location: op-revm/src/l1block.rs:186
```

Foundry v1.7.x treats Celo as an OP-stack chain (Celo migrated to the OP
stack) and expects an "Isthmus" L1 operator-fee scalar that this Celo
deployment doesn't expose the same way OP mainnet does. This is an **upstream
Foundry bug**, not a bug in this repo — compilation is clean and the unit
suite runs and passes; only fork instantiation crashes, before any test logic
in `CeloSaveAutoDepositRouter.fork.t.sol` executes. Worth re-testing against
each new Foundry release; consider reporting/tracking upstream at
[foundry-rs/foundry](https://github.com/foundry-rs/foundry) if not already
tracked.

**Until that's fixed upstream**, the pre-deployment gate for the Aave-reserve
assumption the router depends on (cUSD is active/not frozen/not paused on
Aave V3 Celo, with supply-cap headroom) is:

```bash
CELO_RPC_URL=https://forno.celo.org pnpm verify:aave-reserve
```

(`../../scripts/verify-aave-reserve.mjs` — plain Node + viem, no Foundry
dependency, does the same checks the fork test's first assertion does via
direct `eth_call`s against the real chain.)

## Deployment gate

Do not deploy `CeloSaveAutoDepositRouter` until **both**:

1. `forge test --match-path test/CeloSaveAutoDepositRouter.unit.t.sol` is fully green, and
2. `pnpm verify:aave-reserve` passes against a live Celo RPC.

If/when the Foundry fork issue above is resolved, the full fork suite
(`test/CeloSaveAutoDepositRouter.fork.t.sol`) becomes part of this gate too —
it's already written and ready to run, just currently blocked from executing
end-to-end by the issue above.
