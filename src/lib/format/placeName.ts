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
 * Enrichment leaves three classes of mess in `city`, which fragment any
 * by-city grouping and read as sloppy:
 *   1. an EDITORIAL label ("Downtown Frederick") that belongs on the
 *      municipality NAME, not the postal city, and is wrong for the many
 *      City-of-Frederick places that aren't downtown — postal city is
 *      "Frederick";
 *   2. case + spelling variants ("woodsboro", "urbana", "Mt Airy",
 *      "Fredrick");
 *   3. non-city junk ("MD", "Frederick County", "315", "129 W Patrick St").
 *
 * This repairs all three at the loader boundary so `city` is the consistent
 * postal city. Surfaces that want the editorial label still read it from the
 * municipality name (todaysDeals / happy-hour do), which is untouched. Runs
 * BEFORE human patches, so a curated city override would win.
 */

// The postal cities in/around Frederick County (12 municipalities + Urbana),
// used to repair case variants back to canonical Title Case.
const CANONICAL_CITIES = [
  "Frederick", "Thurmont", "Brunswick", "New Market", "Walkersville", "Middletown",
  "Mount Airy", "Emmitsburg", "Myersville", "Woodsboro", "Burkittsville", "Urbana",
];
const CANON_BY_LC = new Map(CANONICAL_CITIES.map((c) => [c.toLowerCase(), c]));

// Editorial / abbreviation / misspelling folds (keyed lowercased), tried first.
const CITY_FOLDS: Record<string, string> = {
  "downtown frederick": "Frederick",
  "fredrick": "Frederick",
  "mt airy": "Mount Airy",
  "mt. airy": "Mount Airy",
};

// Values that are never a city — a bare state code, a county, or anything that
// starts with a number (a bare number or a street address). When we see one,
// the place's municipality is the reliable source.
function looksLikeJunkCity(t: string): boolean {
  return /^[A-Z]{2}$/.test(t) || /\bcounty\b/i.test(t) || /^\d/.test(t);
}

// The municipality slug IS the postal city (Title-cased) for every town,
// including "frederick" -> "Frederick" (the editorial "Downtown Frederick"
// lives on the NAME, not here). "new-market" -> "New Market".
function cityFromMunicipality(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function normalizeCity(raw: string, municipalitySlug?: string): string {
  if (!raw) return raw;
  const t = raw.replace(/\s+/g, " ").trim();
  const lc = t.toLowerCase();
  if (CITY_FOLDS[lc]) return CITY_FOLDS[lc];
  const canon = CANON_BY_LC.get(lc);
  if (canon) return canon;
  if (municipalitySlug && looksLikeJunkCity(t)) return cityFromMunicipality(municipalitySlug);
  return t;
}
