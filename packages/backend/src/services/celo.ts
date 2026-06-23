// ERC-20 transfer(address,uint256) selector: keccak256 first 4 bytes
const TRANSFER_SELECTOR = "0xa9059cbb";

// Source: docs.celo.org/build-with-ai/x402
const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e";

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

interface RpcTransaction {
  to: string | null;
  input: string;
}

interface RpcReceipt {
  status: string; // "0x1" = success
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  actualAmount?: bigint;
}

// Verify that txHash is a confirmed USDT transfer(treasury, >=minAmount)
export async function verifyUsdtTransfer(
  txHash: string,
  expectedTo: string,
  minAmount: bigint
): Promise<VerifyResult> {
  try {
    const [tx, receipt] = await Promise.all([
      rpcCall<RpcTransaction | null>("eth_getTransactionByHash", [txHash]),
      rpcCall<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !receipt) {
      return { valid: false, reason: "Transaction not found" };
    }

    if (receipt.status !== "0x1") {
      return { valid: false, reason: "Transaction failed or not confirmed" };
    }

    if (tx.to?.toLowerCase() !== USDT.toLowerCase()) {
      return { valid: false, reason: "Transaction is not to USDT contract" };
    }

    const input = tx.input.toLowerCase();

    if (!input.startsWith(TRANSFER_SELECTOR)) {
      return { valid: false, reason: "Not a transfer call" };
    }

    // ABI decode: selector(4B) + address(32B, left-padded) + uint256(32B)
    const data = input.slice(2); // strip 0x
    if (data.length < 8 + 64 + 64) {
      return { valid: false, reason: "Calldata too short" };
    }

    // address is the last 20 bytes of the first 32-byte slot (right-aligned)
    const toHex = "0x" + data.slice(8 + 24, 8 + 64); // skip selector(4B) + 12B padding
    const amountHex = "0x" + data.slice(8 + 64, 8 + 128);

    if (toHex.toLowerCase() !== expectedTo.toLowerCase()) {
      return { valid: false, reason: "Transfer recipient does not match treasury" };
    }

    const amount = BigInt(amountHex);

    if (amount < minAmount) {
      return {
        valid: false,
        reason: `Amount ${amount} is less than required ${minAmount}`,
      };
    }

    return { valid: true, actualAmount: amount };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, reason: `Verification error: ${msg}` };
  }
}
