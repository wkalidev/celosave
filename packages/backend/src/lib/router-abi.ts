// Minimal ABI for CeloSaveAutoDepositRouter — mirrors
// packages/contracts/src/CeloSaveAutoDepositRouter.sol and
// packages/app/src/lib/router-abi.ts exactly. Keep all three in sync; if the
// contract's function signatures ever change, this file must change with
// them or every encode/decode/read call here will silently target the wrong
// selector. Duplicated here rather than imported across packages because
// this repo has no shared-code package between app/ and backend/ — see
// KEEPER.md for the tradeoff.
export const routerAbi = [
  {
    name: "plans",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "monthlyAmount", type: "uint128" },
      { name: "interval", type: "uint64" },
      { name: "nextExecutionTime", type: "uint64" },
      { name: "active", type: "bool" },
    ],
  },
  {
    name: "depositFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "PlanSet",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "monthlyAmount", type: "uint256", indexed: false },
      { name: "interval", type: "uint256", indexed: false },
      { name: "nextExecutionTime", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PlanCancelled",
    type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }],
  },
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "netSupplied", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "nextExecutionTime", type: "uint256", indexed: false },
    ],
  },
] as const;
