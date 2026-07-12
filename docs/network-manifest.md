# CeloSave Network Manifest

All external origins and URLs the app communicates with, required for MiniPay Mini App Store submission.

## Frontend (celosave-two.vercel.app)

| Origin | Purpose | Protocol |
|---|---|---|
| `https://celosave-two.vercel.app` | App itself (Vercel hosting) | HTTPS |
| `https://app-production-6b36.up.railway.app` | CeloSave backend API (airtime quotes, x402 analytics) | HTTPS |
| `https://celo-mainnet.g.alchemy.com` | Celo Mainnet JSON-RPC (read contract state, send transactions) | HTTPS |
| `https://fonts.googleapis.com` | Google Fonts (Inter font) | HTTPS |
| `https://fonts.gstatic.com` | Google Fonts static assets | HTTPS |

## Smart Contract Addresses (Celo Mainnet, chain ID 42220)

| Contract | Address | Purpose |
|---|---|---|
| CeloSaveRegistry | `0x9213CBE6c3aFf7c1422038d91ECb2362E6907e83` | User onboarding registration |
| Aave V3 Pool | `0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402` | USDT/USDC/cUSD deposits and withdrawals |
| aUSDT (Aave Interest Token) | `0x975CfE78e3dD503e9E6d7D6C93b47B1e07E0DaF4` | Yield-bearing USDT receipt token |
| aUSDC (Aave Interest Token) | `0x307a3C8c3B4C90bE96a58eBF8Ac86Fe3cE940b8a` | Yield-bearing USDC receipt token |
| aCelcUSD (Aave Interest Token) | `0xBba98352628B0B0c4b40583F593fFCb630935a45` | Yield-bearing cUSD receipt token |
| USDT (Celo) | `0x48065fbbe25f71C9282ddf5e1cD6D6A887483D5e` | Celo-native USDT stablecoin |
| USDC (Celo) | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | Celo-native USDC stablecoin |
| cUSD (Celo) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | Celo-native cUSD stablecoin |
| USDT Fee Adapter | `0x4F1aFc6B8Ef9B4a8e21A7E1CdB6b0f8e3Ec1E2b` | CIP-64 gas fee abstraction for USDT |
| USDC Fee Adapter | `0xd0fA06bc24a07D941a82bC09e66cC25A5E67bA0e` | CIP-64 gas fee abstraction for USDC |
| CeloSaveAutoDepositRouter | `0x27FEd876Dbc44BF4D4EC7D1ccfFE1b60FA09fF4f` | Non-custodial Auto-Save: holds a capped, revocable cUSD allowance and monthly plan per user; supplies straight to Aave V3 `onBehalfOf` the user. cUSD needs no separate fee adapter — natively whitelisted as a CIP-64 feeCurrency. |

## Backend (app-production-6b36.up.railway.app)

| Origin | Purpose | Protocol |
|---|---|---|
| `https://api.africastalking.com` | Africa's Talking airtime top-up API | HTTPS |
| `https://celo-mainnet.g.alchemy.com` | Celo RPC (USDC transfer for airtime payment) | HTTPS |

## Third-Party SDKs / Wallet Infrastructure

| Origin | Purpose | Protocol |
|---|---|---|
| `https://registry.walletconnect.org` | WalletConnect wallet registry (RainbowKit) | HTTPS |
| `https://relay.walletconnect.com` | WalletConnect relay (RainbowKit) | HTTPS / WSS |
| `https://pulse.walletconnect.org` | WalletConnect analytics (RainbowKit) | HTTPS |
| `https://explorer-api.walletconnect.com` | WalletConnect explorer (RainbowKit) | HTTPS |

## Notes

- No advertising trackers, analytics SDKs, or third-party analytics scripts are loaded.
- The app does not call any social media APIs or embed third-party widgets.
- All blockchain reads use the Alchemy RPC endpoint; no public/unauthenticated RPC nodes are used.
- In MiniPay context, WalletConnect endpoints are never reached (wallet is injected by MiniPay directly).
