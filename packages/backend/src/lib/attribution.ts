import { toDataSuffix } from "@celo/attribution-tags";
import { concat, type Hex } from "viem";

// ─── Celo Builders Attribution Tag (ERC-8021) ─────────────────────────────
// The router keeper (see services/router-keeper.ts) is the one place this
// backend signs and sends its own transactions — depositFor(user, amount),
// paid for out of the keeper's own CELO gas. Tagging those calls the same
// way the frontend tags user-signed ones (see app/src/lib/attribution.ts)
// keeps all of CeloSave's on-chain volume attributed consistently for
// programs like Proof of Ship and hackathon leaderboards.
//
// Set ATTRIBUTION_TAG once registered at celobuilders.xyz — see
// https://docs.celo.org/build-on-celo/attribution-tags. Not NEXT_PUBLIC_-
// prefixed: this runs server-side only (Railway), never in a browser.

const OWN_CODE = process.env.OWN_ATTRIBUTION_CODE;
const ASSIGNED_TAG = process.env.ATTRIBUTION_TAG;

function resolveCodes(): string[] | null {
  const codes = [OWN_CODE, ASSIGNED_TAG].filter(
    (c): c is string => typeof c === "string" && c.length > 0
  );
  return codes.length > 0 ? codes : null;
}

let cachedSuffix: Hex | null | undefined = undefined;

function getSuffix(): Hex | null {
  if (cachedSuffix !== undefined) return cachedSuffix;
  const codes = resolveCodes();
  cachedSuffix = codes ? toDataSuffix(codes.length === 1 ? codes[0] : codes) : null;
  if (cachedSuffix) {
    console.log(`🏷️ [attribution] tagging keeper transactions with: ${resolveCodes()!.join(", ")}`);
  }
  return cachedSuffix;
}

// Appends the configured attribution suffix to calldata. No-op (returns the
// input unchanged) when ATTRIBUTION_TAG / OWN_ATTRIBUTION_CODE aren't set.
export function tagCalldata(data: Hex): Hex {
  const suffix = getSuffix();
  if (!suffix) return data;
  return concat([data, suffix]);
}
