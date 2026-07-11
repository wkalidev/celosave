// Fetches live protocol stats from Celo mainnet via Alchemy RPC

// Source: bgd-labs/aave-address-book AaveV3Celo.ts
const AAVE_DATA_PROVIDER = "0x2e0f8D3B1631296cC7c56538D6Eb6032601E15ED";
const USDT_A_TOKEN = "0xDeE98402A302e4D707fB9bf2bac66fAEEc31e8Df";
const USDC_A_TOKEN = "0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785";

// Source: docs.celo.org/build-with-ai/x402
const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e";
// Source: docs.celo.org
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

// No hardcoded fallback: assertProductionConfigSafe() refuses to boot the
// process if this is unset, so by the time routes run it is always present.
const TREASURY = process.env.TREASURY_ADDRESS as string;
const DECIMALS = 6;
const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

function rpcUrl(): string {
  return `https://celo-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
}

async function eth_call(to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = (await res.json()) as { result: string; error?: { message: string } };
  if (json.error) throw new Error(`RPC: ${json.error.message}`);
  return json.result;
}

// Decode a 32-byte hex slot as bigint
function decodeUint(hex: string, slot = 0): bigint {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const start = slot * 64;
  return BigInt("0x" + clean.slice(start, start + 64));
}

// getReserveData selector: 0x35ea6a75 — liquidityRate is output slot 5
async function getLiquidityRate(asset: string): Promise<bigint> {
  // Pad asset address to 32 bytes
  const padded = asset.replace("0x", "").padStart(64, "0").toLowerCase();
  const data = "0x35ea6a75" + padded;
  const result = await eth_call(AAVE_DATA_PROVIDER, data);
  return decodeUint(result, 5); // slot 5 = liquidityRate
}

// balanceOf selector: 0x70a08231
async function getATokenBalance(aToken: string, account: string): Promise<bigint> {
  const padded = account.replace("0x", "").padStart(64, "0").toLowerCase();
  const data = "0x70a08231" + padded;
  const result = await eth_call(aToken, data);
  return decodeUint(result, 0);
}

function liquidityRateToApyPct(rate: bigint): number {
  const apr = Number(rate) / Number(RAY);
  return (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
}

function formatTokenAmount(raw: bigint): string {
  if (raw === 0n) return "0.00";
  const s = raw.toString().padStart(DECIMALS + 1, "0");
  return `${s.slice(0, -DECIMALS)}.${s.slice(-DECIMALS, -DECIMALS + 2)}`;
}

export interface ProtocolStats {
  protocol: string;
  version: string;
  timestamp: number;
  aave: {
    usdtApyPct: number;
    usdcApyPct: number;
  };
  treasury: {
    usdtAToken: string;
    usdcAToken: string;
  };
  fees: {
    yieldBps: number;
    billPayBps: number;
  };
}

export async function fetchProtocolStats(): Promise<ProtocolStats> {
  const [usdtRate, usdcRate, usdtBal, usdcBal] = await Promise.all([
    getLiquidityRate(USDT),
    getLiquidityRate(USDC),
    getATokenBalance(USDT_A_TOKEN, TREASURY),
    getATokenBalance(USDC_A_TOKEN, TREASURY),
  ]);

  return {
    protocol: "CeloSave",
    version: "1.0.0",
    timestamp: Math.floor(Date.now() / 1000),
    aave: {
      usdtApyPct: Number(liquidityRateToApyPct(usdtRate).toFixed(4)),
      usdcApyPct: Number(liquidityRateToApyPct(usdcRate).toFixed(4)),
    },
    treasury: {
      usdtAToken: formatTokenAmount(usdtBal),
      usdcAToken: formatTokenAmount(usdcBal),
    },
    fees: {
      // No yield fee is currently collected on the plain Save flow (Aave
      // deposits/withdrawals are direct, no CeloSave contract in the path).
      // See docs/yield-fee-design.md for the proposed collection mechanism
      // and why it isn't live yet. Keep this at 0 until that mechanism
      // actually ships — do not restore a nonzero value here without a
      // real fee-taking code path to back it.
      yieldBps: 0,
      billPayBps: 150,
    },
  };
}
