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
