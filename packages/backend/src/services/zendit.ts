const ZENDIT_BASE = process.env.ZENDIT_API_URL ?? "https://test-api.zendit.io/v1";

// Approximate EUR/USD — update from live feed before mainnet scale
const EUR_TO_USD = 1.12;

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface ZenditOffer {
  offerId: string;
  country: string;
  brand: string;
  brandName: string;
  subTypes: string[];
  priceType: string;
  send: {
    currency: string;
    currencyDivisor: number;
    fixed: number;
  };
  price: {
    currency: string;
    currencyDivisor: number;
    fixed: number;
  };
}

interface ZenditOfferPage {
  total: number;
  limit: number;
  offset: number;
  list: ZenditOffer[];
}

export interface ZenditPurchaseResult {
  transactionId: string;
  status: string;
  send?: number;
  sendCurrency?: string;
  sendCurrencyDivisor?: number;
  country?: string;
  confirmation?: {
    confirmationNumber: string;
    externalReferenceId: string;
  };
}

interface CacheEntry {
  offers: ZenditOffer[];
  fetchedAt: number;
}

const offerCache = new Map<string, CacheEntry>();

function authHeader(): string {
  const key = process.env.ZENDIT_API_KEY;
  if (!key) throw new Error("ZENDIT_API_KEY not configured");
  return `Bearer ${key}`;
}

async function fetchAllTopupOffers(country: string): Promise<ZenditOffer[]> {
  const all: ZenditOffer[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${ZENDIT_BASE}/topups/offers?_limit=${limit}&_offset=${offset}&country=${country}&subType=Mobile+Top+Up`;
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    if (!res.ok) throw new Error(`Zendit catalog error: ${res.status}`);
    const page = await res.json() as ZenditOfferPage;
    all.push(...page.list);
    if (all.length >= page.total || page.list.length === 0) break;
    offset += limit;
  }

  return all;
}

export async function getTopupOffers(country: string): Promise<ZenditOffer[]> {
  const cached = offerCache.get(country);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.offers;
  const offers = await fetchAllTopupOffers(country);
  offerCache.set(country, { offers, fetchedAt: Date.now() });
  return offers;
}

export function eurCentsToUsd(eurCents: number): number {
  return (eurCents / 100) * EUR_TO_USD;
}

// If carrierHint is given, prefer offers whose brand matches it (see
// lib/carrier.ts) — falls back to unfiltered closest-price matching when
// there's no hint, or no offer matches the hint, so detection gaps never
// block a purchase outright.
export function findClosestOffer(
  offers: ZenditOffer[],
  usdAmount: number,
  carrierHint?: string | null
): ZenditOffer | null {
  if (offers.length === 0) return null;

  const matchingCarrier = carrierHint
    ? offers.filter(
        (o) =>
          o.brandName?.toLowerCase().includes(carrierHint.toLowerCase()) ||
          o.brand?.toLowerCase().includes(carrierHint.toLowerCase())
      )
    : [];
  const candidates = matchingCarrier.length > 0 ? matchingCarrier : offers;

  return candidates.reduce((best, offer) => {
    const diff = Math.abs(eurCentsToUsd(offer.price.fixed) - usdAmount);
    const bestDiff = Math.abs(eurCentsToUsd(best.price.fixed) - usdAmount);
    return diff < bestDiff ? offer : best;
  });
}

export async function createTopupPurchase(
  transactionId: string,
  offerId: string,
  recipientPhoneNumber: string
): Promise<ZenditPurchaseResult> {
  const auth = authHeader();

  const res = await fetch(`${ZENDIT_BASE}/topups/purchases`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId, offerId, recipientPhoneNumber }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`Zendit purchase failed: ${err.message ?? res.status}`);
  }

  const initial = await res.json() as { transactionId: string; status: string };

  // Poll for final status — sandbox typically resolves to DONE within 1 second
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    const poll = await fetch(
      `${ZENDIT_BASE}/topups/purchases/${initial.transactionId}`,
      { headers: { Authorization: auth } }
    );
    if (!poll.ok) throw new Error(`Zendit poll failed: ${poll.status}`);
    const result = await poll.json() as ZenditPurchaseResult;
    if (result.status === "DONE" || result.status === "FAILED") return result;
  }

  throw new Error("Zendit transaction timed out");
}
