import { v4 as uuidv4 } from "uuid";

const QUOTE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface Quote {
  id: string;
  phone: string;
  countryCode: string;
  baseUsdAmount: number;       // airtime value in USD
  markupUsdAmount: number;     // 1.5% of base
  totalUsdAmount: number;      // base + markup
  usdtRaw: bigint;             // total in USDT raw units (6 decimals)
  localAmount: number;         // airtime in local currency
  localCurrency: string;       // e.g. "NGN"
  expiresAt: number;           // unix ms
}

// In-memory store; a real deployment uses Redis or DB
const store = new Map<string, Quote>();

export function createQuote(data: Omit<Quote, "id" | "expiresAt">): Quote {
  const quote: Quote = {
    ...data,
    id: uuidv4(),
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  store.set(quote.id, quote);
  // Evict after TTL + 1min buffer
  setTimeout(() => store.delete(quote.id), QUOTE_TTL_MS + 60_000);
  return quote;
}

export function getQuote(id: string): Quote | null {
  const q = store.get(id);
  if (!q) return null;
  if (Date.now() > q.expiresAt) {
    store.delete(id);
    return null;
  }
  return q;
}

export function consumeQuote(id: string): Quote | null {
  const q = getQuote(id);
  if (q) store.delete(id); // single-use
  return q;
}
