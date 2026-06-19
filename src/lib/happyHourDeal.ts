/**
 * splitDeal / dealHook — read a verified deal string into a headline HOOK
 * (the amount off, shown as a hero) and the REST (what you actually get).
 *
 * The hook is the punchy figure: "50% OFF", "$2 OFF", "$8", "FROM $5". The
 * rest is the offer with that figure removed, so a surface can show the price
 * ONCE on a band/chip and the description in the body (the menu "price + item"
 * pattern) instead of printing the same number twice.
 *
 * Honest by construction: it only reports a number literally in the text; when
 * there is none ("Food and drink specials") the hook is null and the rest is
 * the full offer. Pure + deterministic.
 *
 * Hook priority, strongest first:
 *   1. a percentage / half-off  -> "50% OFF"
 *   2. a dollar discount        -> "$5 OFF"  (largest off wins)
 *   3. a concrete price (>= $2) -> "$8" (single) or "FROM $5" (a real range)
 *   4. nothing numeric          -> null
 */

/** Format a number/numeric-string as a clean price: $5 (whole), $2.50 (cents). */
function money(raw: string | number): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `$${raw}`;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

const PERCENT_G = /(\d{1,3})\s*%\s*off/gi;
const PERCENT_1 = /\d{1,3}\s*%\s*off/i;
const HALF_1 = /\bhalf[-\s]?(?:off|price)\b|\b1\/2\s*(?:price|off)\b/i;
const DOLLAR_OFF_G = /\$\s*(\d+(?:\.\d{1,2})?)\s*off/gi;
const DOLLAR_OFF_1 = /\$\s*\d+(?:\.\d{1,2})?\s*off/i;
const DOLLAR_PRICE_G = /\$\s*(\d+(?:\.\d{1,2})?)/g;
const RANGE_WORD = /\b(from|starting|starts? at|as low as)\b/i;

function firstMatch(re: RegExp, t: string): { text: string; index: number } | null {
  const m = re.exec(t);
  return m ? { text: m[0], index: m.index } : null;
}

/** Tidy the leftover after a figure is removed: collapse space, drop an orphan
 *  leading conjunction/punctuation, sentence-case the start. */
function tidy(s: string): string {
  let r = s.replace(/\s+/g, " ").trim();
  r = r.replace(/^[\s:,;.–—-]+/, "").trim();
  r = r.replace(/^(and|or|on|plus|with)\b\s*/i, "").trim();
  r = r.replace(/\s+([,;.])/g, "$1");
  if (r) r = r.charAt(0).toUpperCase() + r.slice(1);
  return r;
}

export type DealParts = { hook: string | null; rest: string };

export function splitDeal(deal: string | null | undefined): DealParts {
  const t = (deal ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { hook: null, rest: "" };

  let hook: string | null = null;
  let strip: { text: string; index: number } | null = null;

  // 1. percentage / half off (the punchiest).
  let pct = 0;
  for (const m of t.matchAll(PERCENT_G)) pct = Math.max(pct, Number(m[1]));
  const half = HALF_1.exec(t);
  if (half) pct = Math.max(pct, 50);
  if (pct > 0) {
    hook = `${pct}% OFF`;
    const cands = [firstMatch(PERCENT_1, t), half ? { text: half[0], index: half.index } : null]
      .filter((x): x is { text: string; index: number } => x !== null)
      .sort((a, b) => a.index - b.index);
    strip = cands[0] ?? null;
  } else {
    // 2. dollar discount — biggest "$X off".
    let off = 0;
    for (const m of t.matchAll(DOLLAR_OFF_G)) off = Math.max(off, Number(m[1]));
    if (off > 0) {
      hook = `${money(off)} OFF`;
      strip = firstMatch(DOLLAR_OFF_1, t);
    } else {
      // 3. a concrete price point (floored at $2 so a 99-cent side never leads).
      const prices = new Set<number>();
      for (const m of t.matchAll(DOLLAR_PRICE_G)) {
        const n = Number(m[1]);
        if (n >= 2) prices.add(n);
      }
      if (prices.size > 0) {
        const min = Math.min(...prices);
        const ranged = prices.size > 1 || RANGE_WORD.test(t);
        hook = ranged ? `FROM ${money(min)}` : money(min);
        // Strip the cheapest price token (the figure the hook shows).
        strip = firstMatch(new RegExp(`\\$\\s*${String(min).replace(".", "\\.")}(?!\\d)`), t);
      }
    }
  }

  if (!hook) return { hook: null, rest: t };
  let rest = strip ? t.slice(0, strip.index) + t.slice(strip.index + strip.text.length) : t;
  rest = tidy(rest);
  // If stripping gutted the description, keep the full offer rather than a stub.
  if (rest.length < 3) rest = t;
  return { hook, rest };
}

/** Just the headline hook (the amount off), or null. */
export function dealHook(deal: string | null | undefined): string | null {
  return splitDeal(deal).hook;
}

/** How many distinct money figures the deal names ("$6-$7" counts 2). Used to
 *  tell a SINGLE-discount deal (where a hero figure reads cleanly) from a
 *  multi-part one (where ripping out one figure strands its subject). */
export function figureCount(deal: string | null | undefined): number {
  const m = (deal ?? "").match(/\d{1,3}\s*%|\$\s*\d+(?:\.\d{1,2})?|\bhalf[-\s]?(?:off|price)\b/gi);
  return m ? m.length : 0;
}

/**
 * dealQuality — the ONE ranking signal for "how clear/compelling is this deal",
 * used as the PRIMARY sort key on every happy-hour surface. A vague-at-source
 * entry (no figure) must NEVER out-rank a figure-bearing one, so tier 0 sits
 * below everything. Tiers, strongest first:
 *   4  a percentage off ("50% OFF") — the punchiest
 *   3  a dollar discount ("$5 OFF")
 *   2  a concrete price ("$8", "FROM $5")
 *   1  a figure is present but not a clean hook (e.g. a sub-$2 price)
 *   0  figureless / vague at source ("food and drink specials")
 */
export function dealQuality(deal: string | null | undefined): number {
  if (figureCount(deal) === 0) return 0;
  const hook = dealHook(deal);
  if (!hook) return 1;
  if (hook.endsWith("% OFF")) return 4;
  if (hook.includes(" OFF")) return 3;
  return 2;
}

// A money figure anywhere in a clause: "$5", "$2.50", "$5 off", "50% off",
// "25%", "half-price". Used to emphasize the figure inside its own phrase.
const FIGURE_TOKEN = /\$\s*\d+(?:\.\d{1,2})?(?:\s*off)?|\d{1,3}\s*%(?:\s*off)?|\bhalf[-\s]?(?:off|price)\b/gi;

/** Split the figures out of a clause WITHOUT reordering, so it can render with
 *  each figure emphasized in place: "$4 craft pints" -> [{figure:"$4"}, " craft pints"].
 *  Pure; preserves the original word order (never strands a subject). */
export function emphasizeFigures(clause: string): Array<{ text: string; figure: boolean }> {
  const out: Array<{ text: string; figure: boolean }> = [];
  let last = 0;
  const re = new RegExp(FIGURE_TOKEN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(clause)) !== null) {
    if (m.index > last) out.push({ text: clause.slice(last, m.index), figure: false });
    out.push({ text: m[0].replace(/\s+/g, " "), figure: true });
    last = m.index + m[0].length;
  }
  if (last < clause.length) out.push({ text: clause.slice(last), figure: false });
  return out.length ? out : [{ text: clause, figure: false }];
}

/**
 * dealClauses — split a verified deal into clean, self-contained clauses, each
 * keeping its OWN figure glued to what it's for. This is the Roasthouse model
 * ("50% off all wings", "$2 off full-pour drafts") applied to every deal: never
 * a figure divorced from its subject, never a sentence truncated mid-word.
 *
 * "Tue $4 craft pints and 25% off crab legs, Thu $1 oysters"
 *   -> ["Tue $4 craft pints", "25% off crab legs", "Thu $1 oysters"]
 *
 * Splits on list/sentence separators, and on " and "/" plus " ONLY when the next
 * clause starts a new figure (so "draft and wine", "fish and chips" stay whole).
 * Pure + deterministic.
 */
export function dealClauses(deal: string | null | undefined): string[] {
  const t = (deal ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const FIG_AHEAD = String.raw`(?=\$\s*\d|\d{1,3}\s*%|half[-\s]?(?:off|price))`;
  const SEP = new RegExp(
    String.raw`\s*[;,]\s*|\.\s+(?=[A-Z$0-9])|\s+(?:and|plus|&)\s+${FIG_AHEAD}`,
    "i",
  );
  const out: string[] = [];
  for (let p of t.split(SEP)) {
    p = p
      .replace(/^[\s:,;.–—-]+/, "")
      .replace(/[\s.,;]+$/, "")
      .replace(/^(?:and|or|plus|with|&)\s+/i, "")
      .trim();
    if (p.length >= 2) out.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  return out.length ? out : [t];
}
