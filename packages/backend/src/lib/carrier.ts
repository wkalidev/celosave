// Best-effort mobile-network detection from a phone number's prefix, used to
// avoid buying an airtime offer for the wrong carrier (which fails delivery
// after the user has already paid on-chain). Only Nigeria has a prefix table
// today since it's the highest-volume market on the Zendit route; other
// countries return null and fall back to plain closest-price matching
// (previous behavior). Carrier-to-prefix allocations shift over time with
// number portability — replace with a live HLR/carrier-lookup API (Zendit
// or a dedicated provider) before relying on this for other markets.
const NG_CARRIER_PREFIXES: Record<string, string[]> = {
  MTN: ["803", "806", "703", "706", "813", "814", "816", "810", "903", "906", "913", "916"],
  Airtel: ["802", "808", "708", "812", "701", "902", "901", "904", "912"],
  Glo: ["805", "807", "705", "815", "811", "905", "915"],
  "9mobile": ["809", "817", "818", "908", "909"],
};

export function detectCarrier(phone: string, countryCode: string): string | null {
  if (countryCode !== "NG") return null;

  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("234") ? digits.slice(3) : digits.replace(/^0/, "");
  const prefix = local.slice(0, 3);

  for (const [carrier, prefixes] of Object.entries(NG_CARRIER_PREFIXES)) {
    if (prefixes.includes(prefix)) return carrier;
  }
  return null;
}
