# CeloSave

A MiniPay-native savings app on Celo. Deposit stablecoins, earn Aave V3 yield, set recurring auto-saves, and top up airtime — all without holding CELO for gas.

Live: **https://celosave-two.vercel.app**

---

## Features

### Save
Deposit USDT, USDC, or cUSD into Aave V3 on Celo mainnet and earn yield automatically. Gas fees are paid in whichever of the three you're depositing, via Celo's fee abstraction (no CELO required in MiniPay). Withdraw any time — you receive the full balance. The cUSD tab is also where an Auto-Save plan's deposits land, since Auto-Save supplies cUSD to this same Aave position.

### Auto-Save
Set a fixed monthly cUSD amount once; it deposits automatically into your own Aave V3 position every cycle — non-custodial end to end. You grant `CeloSaveAutoDepositRouter` (`packages/contracts/src/CeloSaveAutoDepositRouter.sol`) a capped, revocable cUSD allowance and an on-chain plan (amount + interval). The contract is immutable — no owner, no admin function, no upgrade path — and never holds cUSD at rest: anyone can permissionlessly trigger an eligible cycle, which atomically pulls exactly your plan's amount and calls Aave's `Pool.supply(cUSD, amount, onBehalfOf: you, 0)` — aTokens are minted straight into your wallet, never CeloSave's. Cancel any time from the UI: it clears your plan and revokes your allowance in two wallet-signed transactions, no backend step.

This replaced an earlier Superfluid-streaming design that turned out to be custodial (streamed funds sat in CeloSave's treasury with no mechanism to actually earn yield in the user's name) — it's fully removed now, not left in as dead code; see git history if you need the old implementation.

**Deployed and verified on Celo mainnet** at [`0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f`](https://celoscan.io/address/0x27fed876dbc44bf4d4ec7d1ccffe1b60fa09ff4f#code). Full smoke test passed in production (`setPlan` + `depositFor` executed on mainnet, aTokens landed in the user's wallet, fee landed in treasury). Deposits are triggered by a Railway cron keeper (`packages/backend/src/keeper.ts` — see `packages/backend/KEEPER.md`); because `depositFor` is permissionless, anyone can also trigger an eligible cycle directly if the keeper is ever down. The pre-deployment gate this passed — kept here for anyone re-verifying or redeploying — was:
```bash
cd packages/contracts && forge test --match-path test/CeloSaveAutoDepositRouter.unit.t.sol
CELO_RPC_URL=https://forno.celo.org pnpm verify:aave-reserve
```

### Pay Bills (Africa's Talking)
Top up mobile airtime in Nigeria, Kenya, Ghana, Uganda, Tanzania, and Rwanda. Pay in USDT; the backend converts to local currency and dispatches via Africa's Talking. A 1.5% markup covers provider fees and treasury.

### Analytics API (x402)
`GET /api/analytics/protocol` returns live Aave APYs and treasury balances. Access costs $0.001 USDC per request — include an `X-PAYMENT` header with a base64-encoded `{"txHash":"0x..."}` of a confirmed on-chain USDC transfer to the server wallet.

---

## Architecture

```
celosave/
├── packages/
│   ├── app/          # Next.js 14 frontend — deployed on Vercel
│   └── backend/      # Express API — deployed on Railway (Docker)
```

**Frontend** (`packages/app`)
- Next.js 14 App Router, RainbowKit + wagmi v2, viem v2
- Tailwind CSS + shadcn/ui components
- MiniPay detection: auto-connects injected provider when running inside MiniPay

**Backend** (`packages/backend`)
- Express + TypeScript, compiled to CommonJS
- Routes: `POST /api/airtime/quote`, `POST /api/airtime/topup`, `GET /api/analytics/protocol`
- `GET /health` for Railway health checks

---

## Key Contracts (Celo Mainnet)

| Contract | Address |
|---|---|
| **CeloSaveRegistry** | `0x9213CBE6c3aFf7c1422038d91ECb2362E6907e83` |
| **CeloSaveAutoDepositRouter** | [`0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f`](https://celoscan.io/address/0x27fed876dbc44bf4d4ec7d1ccffe1b60fa09ff4f#code) — deployed and verified |
| Aave V3 Pool | `0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402` |
| Aave V3 Pool Addresses Provider | `0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5` |
| Aave Data Provider | `0x2e0f8D3B1631296cC7c56538D6Eb6032601E15ED` |
| cUSD Aave aToken (aCelcUSD) | `0xBba98352628B0B0c4b40583F593fFCb630935a45` |
| USDT | `0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e` |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| USDT Fee Adapter | `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` |
| Protocol Treasury | `0x3AC95343494979d0c92195D387D278DCb3d6d595` |

Addresses above are the source of truth as hardcoded in `packages/app/src/lib/contracts.ts`. Re-verify the Aave reserve state cUSD Auto-Save depends on (active/not frozen/not paused/supply-cap headroom) directly against a live Celo RPC any time before deploying the router:

```bash
CELO_RPC_URL=https://forno.celo.org pnpm verify:aave-reserve
```

---

## Local Development

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
# Install dependencies
pnpm install

# Start frontend (http://localhost:3000)
pnpm dev

# Start backend (http://localhost:3001)
pnpm backend
```

Backend environment variables (copy from `.env.example` or create `packages/backend/.env`):

```env
PORT=3001
ALCHEMY_API_KEY=your_alchemy_key
SERVER_WALLET_ADDRESS=0x...        # receives x402 analytics payments
TREASURY_ADDRESS=0x...             # receives bill-pay markup — required, no fallback
AT_API_KEY=your_at_key             # Africa's Talking
AT_USERNAME=sandbox                # or your AT username
AT_ENV=sandbox                     # sandbox | production
SANDBOX_SKIP_VERIFY=true           # set false in production — the process refuses to boot if this is true and NODE_ENV=production
CORS_ORIGIN=https://your-frontend.example.com   # comma-separated list of allowed origins; unset = no cross-origin access allowed
DB_PATH=./data/celosave.sqlite     # SQLite file used for payment replay protection — point this at a persistent volume in production (see Deployment)
```

---

## Deployment

**Frontend → Vercel**

Root directory: `packages/app`. Vercel auto-deploys on push to `main`.

**Backend → Railway**

Connect the GitHub repo in the Railway dashboard. Railway uses `railway.json` at the repo root and `packages/backend/Dockerfile`. Set the environment variables above in the Railway service settings (Variables tab). Health check path: `/health`.

**Important:** attach a [Railway Volume](https://docs.railway.app/reference/volumes) to the backend service and set `DB_PATH` to a file inside it (e.g. `/data/celosave.sqlite`). Without a mounted volume, the container filesystem is ephemeral and the payment-replay-protection database is wiped on every redeploy — it only survives simple process restarts within the same container, not a full redeploy.

---

## Protocol Fees

| Action | Fee |
|---|---|
| Airtime top-up | 1.50% markup on USD amount |
| Auto-Save subscription | Variable (user sets monthly deposit amount); router protocol fee is immutable and hard-capped at 1% |
| Analytics API | $0.001 USDC per request (x402) |

---

## 👤 Author
Built by [@wkalidev](https://github.com/wkalidev) — zcodebase.eth
