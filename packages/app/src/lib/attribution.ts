import { toDataSuffix } from "@celo/attribution-tags"
import { concat, type Hex } from "viem"

// ─── Celo Builders Attribution Tag (ERC-8021) ─────────────────────────────
// Every transaction CeloSave sends from the user's own wallet gets an
// attribution suffix appended to its calldata. The EVM discards trailing
// bytes it doesn't consume, so this never changes execution semantics — it
// just makes on-chain activity identifiable as coming from this app for
// programs like Proof of Ship, MiniPay leaderboards, and hackathon tracking
// (the "Agentic Payments & DeFAI" hackathon leaderboard reads exactly this).
//
// Set NEXT_PUBLIC_ATTRIBUTION_TAG once you've registered at celobuilders.xyz
// and received your assigned code (format: "celo_" + 12 hex chars):
//   npx skills add https://celobuilders.xyz
//   → ask the connected skill to register you (projectName, githubUrl,
//     telegram) for the "agentic-payments-defai" hackathon — the response
//     returns your attributionTag.
// Must be NEXT_PUBLIC_-prefixed: this runs in the browser, in the user's own
// wallet-signing flow (wagmi/viem), not on a trusted server.
// See https://docs.celo.org/build-on-celo/attribution-tags
//
// If you already carry your own code, set NEXT_PUBLIC_OWN_ATTRIBUTION_CODE
// alongside it — only the assigned tag is credited by the leaderboard, but
// ERC-8021 suffixes can carry multiple codes at once.

const OWN_CODE = process.env.NEXT_PUBLIC_OWN_ATTRIBUTION_CODE
const ASSIGNED_TAG = process.env.NEXT_PUBLIC_ATTRIBUTION_TAG

function resolveCodes(): string[] | null {
  const codes = [OWN_CODE, ASSIGNED_TAG].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  )
  return codes.length > 0 ? codes : null
}

let cachedSuffix: Hex | null | undefined = undefined

// Lazily computes (and caches) the ERC-8021 data suffix for the configured
// codes. Returns null when no attribution codes are configured, in which
// case callers should leave calldata untouched.
function getSuffix(): Hex | null {
  if (cachedSuffix !== undefined) return cachedSuffix
  const codes = resolveCodes()
  cachedSuffix = codes ? toDataSuffix(codes.length === 1 ? codes[0] : codes) : null
  if (cachedSuffix && typeof window !== "undefined") {
    console.log(`🏷️ [attribution] tagging transactions with: ${resolveCodes()!.join(", ")}`)
  }
  return cachedSuffix
}

// Appends the configured attribution suffix to a transaction's calldata.
// No-op (returns the input unchanged) when no attribution codes are
// configured, so this is safe to call unconditionally at every send site.
export function tagCalldata(data: Hex): Hex {
  const suffix = getSuffix()
  if (!suffix) return data
  return concat([data, suffix])
}
