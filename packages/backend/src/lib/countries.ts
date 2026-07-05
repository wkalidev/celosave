export interface Country {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  dialCode: string;   // E.164 prefix
  currency: string;   // local currency code
  // Approximate USD exchange rate — update from live feed before mainnet scale
  usdRate: number;    // 1 USD = N local currency units
  testPhone: string;  // Sandbox test number
  provider: "zendit" | "at";
}

export const COUNTRIES: Record<string, Country> = {
  // --- Zendit (overlapping with AT; Zendit used per routing strategy) ---
  NG: {
    code: "NG",
    name: "Nigeria",
    dialCode: "+234",
    currency: "NGN",
    usdRate: 1600,
    testPhone: "+2348012345678",
    provider: "zendit",
  },
  KE: {
    code: "KE",
    name: "Kenya",
    dialCode: "+254",
    currency: "KES",
    usdRate: 130,
    testPhone: "+254711082316",
    provider: "zendit",
  },
  GH: {
    code: "GH",
    name: "Ghana",
    dialCode: "+233",
    currency: "GHS",
    usdRate: 16,
    testPhone: "+233244123456",
    provider: "zendit",
  },
  // --- Africa's Talking (unique route; AT has deep Tanzania operator coverage) ---
  TZ: {
    code: "TZ",
    name: "Tanzania",
    dialCode: "+255",
    currency: "TZS",
    usdRate: 2600,
    testPhone: "+255712345678",
    provider: "at",
  },
  // --- Zendit-only additions ---
  UG: {
    code: "UG",
    name: "Uganda",
    dialCode: "+256",
    currency: "UGX",
    usdRate: 3700,
    testPhone: "+256772345678",
    provider: "zendit",
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    dialCode: "+27",
    currency: "ZAR",
    usdRate: 18,
    testPhone: "+27611234567",
    provider: "zendit",
  },
  PH: {
    code: "PH",
    name: "Philippines",
    dialCode: "+63",
    currency: "PHP",
    usdRate: 57,
    testPhone: "+639171234567",
    provider: "zendit",
  },
  BR: {
    code: "BR",
    name: "Brazil",
    dialCode: "+55",
    currency: "BRL",
    usdRate: 5,
    testPhone: "+5511912345678",
    provider: "zendit",
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
