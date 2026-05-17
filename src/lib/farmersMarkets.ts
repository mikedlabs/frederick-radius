/**
 * Pure: is this place a genuine farmers / farm market (not a grocery
 * chain)? The county ingest left ~66 "market" places conflated —
 * supermarkets, co-ops, creameries, and real farmers markets together.
 * This pulls only the real ones out by an honest name signal, with an
 * explicit chain block-list so a Weis never shows as a farmers market.
 * Conservative: better to miss one than mislabel a grocery store.
 * Unit-tested.
 */

const FARMERS = /\b(farmers?'?\s*&?\s*markets?|growers?\s*markets?|farm\s*market)\b/i;
const CHAIN =
  /\b(weis|giant|safeway|food\s*lion|aldi|wal-?mart|target|wegmans|harris\s*teeter|trader\s*joe|whole\s*foods|7-?eleven|royal\s*farms|sheetz|wawa|dollar\s*(general|tree)|cvs|walgreens|costco|sam'?s\s*club|lidl)\b/i;

export function isFarmersMarket(name: string): boolean {
  if (!name) return false;
  if (CHAIN.test(name)) return false;
  return FARMERS.test(name);
}
