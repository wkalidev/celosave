// USDC transfer verifier — same pattern as celo.ts but for USDC contract
// Source: docs.celo.org
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const TRANSFER_SELECTOR = "0xa9059cbb";

function rpcUrl(): string {
  return `https://celo-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

interface RpcTx { to: string | null; input: string }
interface RpcReceipt { status: string }

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export async function verifyUsdcTransfer(
  txHash: string,
  expectedTo: string,
  minAmount: bigint
): Promise<VerifyResult> {
  try {
    const [tx, receipt] = await Promise.all([
      rpcCall<RpcTx | null>("eth_getTransactionByHash", [txHash]),
      rpcCall<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !receipt) return { valid: false, reason: "Transaction not found" };
    if (receipt.status !== "0x1") return { valid: false, reason: "Transaction not confirmed" };
    if (tx.to?.toLowerCase() !== USDC.toLowerCase())
      return { valid: false, reason: "Transaction is not to USDC contract" };

    const input = tx.input.toLowerCase();
    if (!input.startsWith(TRANSFER_SELECTOR))
      return { valid: false, reason: "Not a transfer call" };

    const data = input.slice(2);
    if (data.length < 8 + 64 + 64) return { valid: false, reason: "Calldata too short" };

    const toHex = "0x" + data.slice(8 + 24, 8 + 64);
    const amount = BigInt("0x" + data.slice(8 + 64, 8 + 128));

    if (toHex.toLowerCase() !== expectedTo.toLowerCase())
      return { valid: false, reason: "Transfer recipient does not match" };

    if (amount < minAmount)
      return { valid: false, reason: `Amount ${amount} < required ${minAmount}` };

    return { valid: true };
  } catch (e: unknown) {
    return { valid: false, reason: `Verification error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
