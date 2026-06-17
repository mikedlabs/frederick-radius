/**
 * dealHook — pull the headline discount out of a verified happy-hour deal
 * string, so a surface can show the AMOUNT OFF as a hero token beside the
 * venue name ("50% OFF", "$2 OFF", "FROM $5") instead of burying it in prose.
 *
 * Honest by construction: it only ever reports a number that is literally in
 * the deal text. When there is no clean number ("Food and drink specials"),
 * it returns null and the caller shows a plain "Specials" — we never invent a
 * discount. Pure + deterministic; the full deal text still renders in full
 * underneath (the specifics are the moat).
 *
 * Priority, strongest hook first:
 *   1. a percentage / half-off  -> "50% OFF" (the punchiest, most legible)
 *   2. a dollar discount        -> "$5 OFF"  (largest off wins)
 *   3. a concrete low price     -> "FROM $3" (the cheapest price named)
 *   4. nothing numeric          -> null      (caller renders "Specials")
 */

/** Format a numeric string as a clean price: drop a trailing .00, keep .50. */
function money(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `$${raw}`;
  // Whole dollars drop the cents ($5, not $5.00); real cents stay ($2.50).
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

const PERCENT_RE = /(\d{1,3})\s*%\s*off/gi;
const HALF_RE = /\bhalf[-\s]?(?:off|price)\b|\b1\/2\s*(?:price|off)\b/i;
const DOLLAR_OFF_RE = /\$\s*(\d+(?:\.\d{1,2})?)\s*off/gi;
const DOLLAR_PRICE_RE = /\$\s*(\d+(?:\.\d{1,2})?)/g;

export function dealHook(deal: string | null | undefined): string | null {
  const t = (deal ?? "").trim();
  if (!t) return null;

  // 1. Percentage / half off — take the biggest percentage mentioned.
  let pct = 0;
  for (const m of t.matchAll(PERCENT_RE)) pct = Math.max(pct, Number(m[1]));
  if (HALF_RE.test(t)) pct = Math.max(pct, 50);
  if (pct > 0) return `${pct}% OFF`;

  // 2. Dollar discount — biggest "$X off" wins (most enticing).
  let off = 0;
  for (const m of t.matchAll(DOLLAR_OFF_RE)) off = Math.max(off, Number(m[1]));
  if (off > 0) return `${money(String(off))} OFF`;

  // 3. A concrete price point — the cheapest named DRINK-anchor price reads as
  //    the hook. Floor at $2 so a 99-cent wing or $1 oyster (a food side, not
  //    the headline pour) never becomes a misleading "FROM $0.99".
  let min = Infinity;
  for (const m of t.matchAll(DOLLAR_PRICE_RE)) min = Math.min(min, Number(m[1]));
  if (Number.isFinite(min) && min >= 2) return `FROM ${money(String(min))}`;

  // 4. No number we can stand behind.
  return null;
}
