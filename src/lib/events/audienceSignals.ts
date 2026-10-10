/**
 * Conservative audience inference for live events.
 *
 * The facet machinery (intents.ts audienceMatches / isForKids, the ?kids=1
 * control on /events) was fully built, but every live loader hardcoded
 * audience: [] — so only the 18 hand-curated rows ever matched. This module
 * populates the field from the words publishers actually wrote, using the
 * same vocabulary the curated rows use ("adults", "kids-0-5", "kids-6-12").
 *
 * Conservative on purpose: a wrong "kids" tag sends a parent somewhere wrong,
 * so only explicit words qualify, an explicit age gate ("21+") beats every
 * kid hint, and silence stays an empty array — absence of a tag is honest
 * uncertainty, never a claim.
 */

const LITTLE_KIDS_RE =
  /\b(?:story\s?times?|toddlers?|preschool(?:ers)?|pre-k|babies|infants?|little ones)\b/;
const BIG_KIDS_RE =
  /\b(?:kids?|children(?:'s)?|youth|family[- ]friendly|family (?:day|fun|night)|for families|school[- ]age|elementary|tweens?)\b/;
const ADULTS_ONLY_RE = /(?:\b21\s*\+|\b18\s*\+|adults?[- ]only)/;

const AGE_RANGE_RE =
  /\bages?\s*(?:[:.]?\s*)?(birth|\d+)\s*(?:[-–—]|to|&|\s+and\s+)\s*(up|adult|\d+)/gi;

function parseAgeBound(raw: string): number | null {
  const value = raw.toLowerCase();
  if (value === "birth") return 0;
  if (value === "up") return 99;
  if (value === "adult") return 99;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse "(ages 11-18)" / "Ages 9-18" style ranges into kids / teens / adults
 * hints. Does not touch admission or is_free — library programs stay unknown
 * unless a publisher proved they are free.
 */
export function audienceFromAgeRanges(
  ...parts: Array<string | null | undefined>
): string[] {
  const text = parts.filter(Boolean).join(" ");
  if (!text) return [];
  const out = new Set<string>();
  for (const match of text.matchAll(AGE_RANGE_RE)) {
    const lo = parseAgeBound(match[1] ?? "");
    const hiRaw = (match[2] ?? "").toLowerCase();
    const hi = parseAgeBound(match[2] ?? "");
    if (lo == null || hi == null) continue;
    const low = Math.min(lo, hi);
    const high = Math.max(lo, hi);
    if (low <= 5) out.add("kids-0-5");
    if (low <= 12 && high >= 6) out.add("kids-6-12");
    if (low <= 17 && high >= 11) out.add("teens");
    if (low >= 18 || hiRaw === "adult") out.add("adults");
  }
  return [...out];
}

/** Audience tags supported by the shared facet vocabulary, inferred from any
 *  text the publisher wrote (title, description, iCal CATEGORIES). */
export function audienceFromText(
  ...parts: Array<string | null | undefined>
): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return [];
  // An explicit age gate is the publisher saying "not for kids"; it wins
  // over any incidental kid-sounding word in the same listing.
  if (ADULTS_ONLY_RE.test(text)) return ["adults"];
  const out: string[] = [];
  if (LITTLE_KIDS_RE.test(text)) out.push("kids-0-5");
  if (BIG_KIDS_RE.test(text)) out.push("kids-6-12");
  for (const tag of audienceFromAgeRanges(...parts)) {
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

export function mergeAudienceHints(
  existing: readonly string[] | null | undefined,
  ...parts: Array<string | null | undefined>
): string[] {
  const out = [...(existing ?? [])];
  for (const tag of audienceFromAgeRanges(...parts)) {
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}
