// Minimal ABI for CeloSaveAutoDepositRouter — mirrors
// packages/contracts/src/CeloSaveAutoDepositRouter.sol exactly. Keep these
// two in sync; if the contract's function signatures ever change, this file
// must change with them or every encode/decode call here will silently
// target the wrong selector.
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
    name: "setPlan",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "monthlyAmount", type: "uint128" },
      { name: "interval", type: "uint64" },
    ],
    outputs: [],
  },
  {
    name: "cancelPlan",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
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
    name: "MIN_INTERVAL",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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

// Default cadence offered in the UI. Must be >= the contract's own
// MIN_INTERVAL (1 day) — 30 days matches the "monthly" framing everywhere
// else in the product (README, protocol fee table, etc).
export const DEFAULT_INTERVAL_SECONDS = 30 * 24 * 60 * 60;

// How many cycles' worth of allowance the UI pre-approves by default when a
// user subscribes. Capped and revocable, per the non-custodial design this
// feature was rebuilt around — never an infinite approval.
export const DEFAULT_APPROVAL_CYCLES = 6;
