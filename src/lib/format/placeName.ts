/**
 * Place-name display normalization.
 *
 * Google Places names arrive with database-row artifacts that break a
 * field-guide brand: lower-cased acronyms ("Pnc Bank"), un-camel-cased
 * Scottish/Irish surnames ("Mcclintock"), and trailing branch-id numbers
 * ("PNC Bank 8", "CVS Pharmacy 95"). This does ONLY the unambiguous,
 * reversible transforms — it never guesses apostrophes (those are
 * hand-corrected via places-overrides.json, since you can't safely tell
 * "Roros" → "Roro's" from "Sons" → "Sons"). Pure + unit-tested. Runs in
 * the loader BEFORE human patches, so a curated name override always wins.
 */

// Acronyms Google lower-cases mid-name. Conservative + unambiguous only —
// matched as whole words, case-insensitively.
const ACRONYMS = new Set([
  "pnc", "cvs", "td", "ups", "usps", "vr", "kfc", "bp", "atm", "hvac",
  "mva", "faa", "nsa", "fbi", "cia", "irs", "dmv", "ymca", "ywca", "pnc",
]);

// A trailing number is a branch id (strip it) ONLY when the name is a
// chain-type the number identifies a branch of — so "Highway 15", "Route 40
// Diner", "Studio 54" are never touched.
const BRANCH_TYPE = /\b(bank|pharmacy|hall|office|store|market|center|centre|branch|atm|supercenter|location|station)\b/i;

export function normalizePlaceName(raw: string): string {
  if (!raw) return raw;
  let n = raw.replace(/\s+/g, " ").trim();
  // 1) Strip a Google branch-id number suffix on chain-type names.
  if (BRANCH_TYPE.test(n)) n = n.replace(/\s+#?\d{1,4}$/, "").trim();
  // 2) Mc CamelCase: "Mcclintock" -> "McClintock" (Mc surnames are reliably
  //    camel-cased; Mac is intentionally excluded — too many real words like
  //    "Machine" start with it).
  n = n.replace(/\bMc([a-z])/g, (_m, c: string) => "Mc" + c.toUpperCase());
  // 3) Upper-case known acronyms: "Pnc Bank" -> "PNC Bank".
  n = n.replace(/\b[A-Za-z]{2,5}\b/g, (w) =>
    ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w,
  );
  return n;
}

/**
 * Postal-city normalization for the raw `city` field.
 *
 * Some enriched records carry an EDITORIAL label in `city` ("Downtown
 * Frederick") instead of the actual postal city. That label belongs on the
 * municipality NAME (MUNICIPALITY_BY_SLUG["frederick"].name is "Downtown
 * Frederick"), not on `city` — and it's factually wrong for the many
 * City-of-Frederick places that aren't downtown (addresses on Buckeystown
 * Pike, Spectrum Dr, W Patrick St, etc.). The postal city is "Frederick".
 *
 * Folding it here makes the `city` field consistent (it was split ~222
 * "Downtown Frederick" / ~644 "Frederick") and honest, while every surface
 * that wants the editorial label keeps reading it from the municipality name
 * (todaysDeals / happy-hour both do), which is untouched. Runs in the loader
 * BEFORE human patches, so a curated city override would still win.
 */
const CITY_FOLDS: Record<string, string> = {
  "downtown frederick": "Frederick",
};
export function normalizeCity(raw: string): string {
  if (!raw) return raw;
  const t = raw.replace(/\s+/g, " ").trim();
  return CITY_FOLDS[t.toLowerCase()] ?? t;
}
