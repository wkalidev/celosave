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
};
