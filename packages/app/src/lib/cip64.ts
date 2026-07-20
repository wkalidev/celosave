import type { WalletClient, SendTransactionParameters } from "viem";
import { celo } from "wagmi/chains";
import { tagCalldata } from "./attribution";

// Celo's CIP-64 fee-abstraction transaction type extends the standard EVM
// transaction with an extra `feeCurrency` field (the ERC20 token gas is
// paid in — cUSD, a fee-adapter address for USDT/USDC — or `undefined` to
// pay in native CELO). viem's WalletClient/SendTransactionParameters types
// don't know about this Celo-specific field, so sending a CIP-64 tx always
// needs an escape hatch somewhere. This file is that one, well-documented
// spot, instead of a `// @ts-ignore` scattered across every call site (this
// codebase used to have 10 of them, across useAutoDeposit.ts, useDeposit.ts,
// and useWithdraw.ts — exactly the kind of thing a reviewer reading the
// fee-payment code would flag). Every caller below is fully typed; the one
// intentional cast lives here.
export interface Cip64TransactionRequest {
  account: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  // undefined = pay gas in native CELO, matching the convention already
  // used elsewhere in this codebase (see fee-currency.ts's FeeCurrencyChoice).
  feeCurrency: `0x${string}` | undefined;
}

type Cip64SendTransactionParameters = SendTransactionParameters & {
  feeCurrency?: `0x${string}`;
};

export function sendCip64Transaction(
  walletClient: WalletClient,
  request: Cip64TransactionRequest
): Promise<`0x${string}`> {
  const params = {
    account: request.account,
    to: request.to,
    chain: celo,
    // Celo Builders attribution tag (ERC-8021), appended once here so every
    // caller — useDeposit, useAutoDeposit, useWithdraw — is tagged for free.
    // No-op until NEXT_PUBLIC_ATTRIBUTION_TAG is set. See lib/attribution.ts.
    data: tagCalldata(request.data),
    feeCurrency: request.feeCurrency,
  } as Cip64SendTransactionParameters;

  return walletClient.sendTransaction(params);
}
