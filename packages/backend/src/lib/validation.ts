import { z } from "zod";
import { COUNTRIES } from "./countries";

// E.164: + followed by 7-15 digits, first digit 1-9
const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const QUOTE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const quoteRequestSchema = z
  .object({
    phone: z.string().regex(E164_REGEX, "phone must be in E.164 format, e.g. +2348012345678"),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine((code) => code in COUNTRIES, { message: "Unsupported country code" }),
    usdAmount: z
      .number()
      .finite()
      .min(0.5, "Amount must be at least $0.50")
      .max(50, "Amount must be at most $50"),
  })
  .superRefine((data, ctx) => {
    const country = COUNTRIES[data.countryCode];
    if (country && !data.phone.startsWith(country.dialCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: `Phone number must start with ${country.dialCode} for country ${data.countryCode}`,
      });
    }
  });

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const topupRequestSchema = z.object({
  quoteId: z.string().regex(QUOTE_ID_REGEX, "quoteId must be a valid UUID"),
  txHash: z.string().regex(TX_HASH_REGEX, "txHash must be a 32-byte hex string"),
});

export type TopupRequest = z.infer<typeof topupRequestSchema>;

export const statusQuerySchema = z.object({
  txHash: z.string().regex(TX_HASH_REGEX, "txHash must be a 32-byte hex string"),
});

export const x402PayloadSchema = z.object({
  txHash: z.string().regex(TX_HASH_REGEX, "txHash must be a 32-byte hex string"),
});
