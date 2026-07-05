export interface Country {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  currency: string;
  // Approximate exchange rate — 1 USD = N local units. Update from live feed before scale.
  usdRate: number;
}

export const COUNTRIES: Record<string, Country> = {
  NG: {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    dialCode: "+234",
    currency: "NGN",
    usdRate: 1600,
  },
  KE: {
    code: "KE",
    name: "Kenya",
    flag: "🇰🇪",
    dialCode: "+254",
    currency: "KES",
    usdRate: 130,
  },
  GH: {
    code: "GH",
    name: "Ghana",
    flag: "🇬🇭",
    dialCode: "+233",
    currency: "GHS",
    usdRate: 16,
  },
  TZ: {
    code: "TZ",
    name: "Tanzania",
    flag: "🇹🇿",
    dialCode: "+255",
    currency: "TZS",
    usdRate: 2600,
  },
  UG: {
    code: "UG",
    name: "Uganda",
    flag: "🇺🇬",
    dialCode: "+256",
    currency: "UGX",
    usdRate: 3700,
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    dialCode: "+27",
    currency: "ZAR",
    usdRate: 18,
  },
  PH: {
    code: "PH",
    name: "Philippines",
    flag: "🇵🇭",
    dialCode: "+63",
    currency: "PHP",
    usdRate: 57,
  },
  BR: {
    code: "BR",
    name: "Brazil",
    flag: "🇧🇷",
    dialCode: "+55",
    currency: "BRL",
    usdRate: 5,
  },
};
