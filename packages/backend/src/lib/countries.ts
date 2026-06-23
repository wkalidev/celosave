export interface Country {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  dialCode: string;   // E.164 prefix
  currency: string;   // AT currency code
  // Approximate USD exchange rate — update from live feed before mainnet scale
  usdRate: number;    // 1 USD = N local currency units
  testPhone: string;  // Sandbox test number
}

export const COUNTRIES: Record<string, Country> = {
  NG: {
    code: "NG",
    name: "Nigeria",
    dialCode: "+234",
    currency: "NGN",
    usdRate: 1600,
    testPhone: "+2348012345678",
  },
  KE: {
    code: "KE",
    name: "Kenya",
    dialCode: "+254",
    currency: "KES",
    usdRate: 130,
    testPhone: "+254711082316",
  },
  GH: {
    code: "GH",
    name: "Ghana",
    dialCode: "+233",
    currency: "GHS",
    usdRate: 16,
    testPhone: "+233244123456",
  },
};

export function getCountry(code: string): Country {
  const c = COUNTRIES[code];
  if (!c) throw new Error(`Unsupported country: ${code}`);
  return c;
}

// Convert a USD amount to local currency units (rounded to 2 decimals)
export function usdToLocal(usdAmount: number, country: Country): number {
  return Math.round(usdAmount * country.usdRate * 100) / 100;
}
