/**
 * Omnibox intent parser — DETERMINISTIC, no model (redesign brief).
 *
 * The single search input parses a small, CLOSED set of intent phrases
 * into removable filter chips; everything else stays free-text to match
 * places / categories / events / towns. This is the honest core: the
 * interface never claims intelligence it doesn't have. If a real model is
 * added later, the branding can change then — the parser stays the floor.
 *
 * Pure + unit-tested. Order matters only for longest-match phrases
 * ("this weekend" before a bare "weekend" would, if we added one).
 */

export type IntentToken =
  | "open-now"
  | "tonight"
  | "this-weekend"
  | "near-me"
  | "free"
  | "with-kids"
  | "outdoors";

export type ParsedQuery = {
  /** Recognized intent tokens, in stable display order. */
  tokens: IntentToken[];
  /** What's left after removing the recognized phrases — the search term. */
  text: string;
};

export const TOKEN_LABEL: Record<IntentToken, string> = {
  "open-now": "Open now",
  tonight: "Tonight",
  "this-weekend": "This weekend",
  "near-me": "Near me",
  free: "Free",
  "with-kids": "With kids",
  outdoors: "Outdoors",
};

// Multi-word phrases first so "this weekend" isn't half-eaten by a future
// shorter rule. Each matches as a whole phrase, case-insensitive.
const PATTERNS: Array<{ token: IntentToken; re: RegExp }> = [
  { token: "open-now", re: /\bopen\s+now\b/i },
  { token: "this-weekend", re: /\bthis\s+weekend\b/i },
  { token: "with-kids", re: /\bwith\s+kids\b/i },
  { token: "near-me", re: /\bnear\s+me\b/i },
  { token: "tonight", re: /\btonight\b/i },
  { token: "free", re: /\bfree\b/i },
  { token: "outdoors", re: /\boutdoors?\b/i },
];

export function parseIntent(input: string): ParsedQuery {
  let text = input ?? "";
  const found = new Set<IntentToken>();
  for (const { token, re } of PATTERNS) {
    if (re.test(text)) {
      found.add(token);
      text = text.replace(re, " ");
    }
  }
  // Stable display order = TOKEN_LABEL key order.
  const tokens = (Object.keys(TOKEN_LABEL) as IntentToken[]).filter((t) =>
    found.has(t),
  );
  return { tokens, text: text.replace(/\s+/g, " ").trim() };
}
