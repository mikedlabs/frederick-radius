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
  return out;
}
