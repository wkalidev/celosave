// Superfluid contract ABIs — only the functions needed for CeloSave subscriptions

export const cfaForwarderAbi = [
  {
    name: "createFlow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "sender", type: "address" },
      { name: "receiver", type: "address" },
      { name: "flowRate", type: "int96" },
      { name: "userData", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "deleteFlow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "sender", type: "address" },
      { name: "receiver", type: "address" },
      { name: "userData", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getFlowInfo",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "sender", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [
      { name: "lastUpdated", type: "uint256" },
      { name: "flowRate", type: "int96" },
      { name: "deposit", type: "uint256" },
      { name: "owedDeposit", type: "uint256" },
    ],
  },
] as const;

export const superTokenFactoryAbi = [
  {
    name: "computeCanonicalERC20WrapperAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_underlyingToken", type: "address" }],
    outputs: [
      { name: "superTokenAddress", type: "address" },
      { name: "isDeployed", type: "bool" },
    ],
  },
  {
    name: "deployCanonicalERC20Wrapper",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_underlyingToken", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const superTokenAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "upgrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "downgrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "realtimeBalanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
    outputs: [
      { name: "availableBalance", type: "int256" },
      { name: "deposit", type: "uint256" },
      { name: "owedDeposit", type: "uint256" },
    ],
  },
] as const;

// Seconds per month (30 days) for flow rate conversion
export const SECONDS_PER_MONTH = 2_592_000n;

// Convert a monthly USD amount (6-decimal raw) to per-second flow rate
export function monthlyToFlowRate(usdcRawPerMonth: bigint): bigint {
  return usdcRawPerMonth / SECONDS_PER_MONTH;
}

// Convert a per-second flow rate back to monthly USD (6-decimal raw)
export function flowRateToMonthly(flowRate: bigint): bigint {
  return flowRate * SECONDS_PER_MONTH;
}

// Format 6-decimal raw amount as USD string
export function formatUsdc(raw: bigint): string {
  if (raw <= 0n) return "$0.00";
  const str = raw.toString().padStart(7, "0");
  const dollars = str.slice(0, -6) || "0";
  const cents = str.slice(-6, -4);
  return `$${dollars}.${cents}`;
}
