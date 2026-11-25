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

const isTownSegment = (segment: string) => {
  const lc = segment.toLowerCase();
  return CANON_BY_LC.has(lc) || Boolean(CITY_FOLDS[lc]);
};
// "MD", "MD 21701", "MD 21701-1234".
const POSTAL_LINE = /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/;
// A house number with no street on it: "25", "12a", "714-1", "8925 D".
const BARE_NUMBER = /^\d+(-\w+)?[A-Za-z]?(\s+[A-Za-z])?$/;
const NUMBERED_STREET = /^\d+(-\w+)?[A-Za-z]?\s+[A-Za-z0-9]/;

/**
 * The street part of a stored address, for telling two same-named places
 * apart. Addresses arrive as a bare street line ("2060 Yellow Springs Rd"),
 * a full postal line ("151 Walkers Village Way, Walkersville, MD 21793"), or
 * with a lead-in before the number ("Shopping Center, 441 E Ridgeville
 * Blvd, Mt Airy, MD 21771"). The house number stays, because two stores can
 * share a street. Pieces split by a stray comma are joined back: a house
 * number before its street ("12a, Poplar St") and an intersection cut at
 * its ampersand ("Wolfsville Rd &, Baltimore National Pike").
 *
 * A segment with no house number is used only when it is not a known town,
 * a postal line, a plus code, a bare number, or a locality directly followed
 * by the state ("Jefferson, MD 21755"). Otherwise this returns undefined. A
 * named landmark with no number ("McGowan Center") still counts as a
 * location; an unknown community name written without its state line can
 * still slip through.
 */
function streetLine(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const pieces = address
    // "104 N Market St (104 Market Street)" repeats itself in parentheses.
    .replace(/\s*\([^)]*\)/g, "")
    .split(",")
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const segments: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    let segment = pieces[i];
    const next = pieces[i + 1];
    const joinable = next !== undefined && !isTownSegment(next) && !POSTAL_LINE.test(next);
    // "2171, 7221 Michaels Mill Rd" already has its own number.
    const numberWantsStreet = BARE_NUMBER.test(segment) && !/^\d/.test(next ?? "");
    if (joinable && (segment.endsWith("&") || numberWantsStreet)) {
      segment = `${segment} ${next}`;
      i++;
    }
    segments.push(segment.replace(/\s*&$/, ""));
  }
  const numbered = segments.find((segment) => NUMBERED_STREET.test(segment) && !BARE_NUMBER.test(segment));
  if (numbered) return numbered;
  const [first, second] = segments;
  if (!first) return undefined;
  const isLocality =
    isTownSegment(first) ||
    POSTAL_LINE.test(first) ||
    // "Frederick MD 21701" with no comma.
    /\b[A-Z]{2}\s+\d{5}(-\d{4})?$/.test(first) ||
    (second !== undefined && POSTAL_LINE.test(second));
  const isPlusCode = /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}$/.test(first);
  const isPlaceholder = /^(parking lot|unnamed road)$/i.test(first);
  return isLocality || isPlusCode || isPlaceholder || BARE_NUMBER.test(first) ? undefined : first;
}

type NamedPlace = { slug: string; name: string; municipality: string; address?: string };

/**
 * A short qualifier for each place whose name repeats in `places`, keyed by
 * slug, so two "Food Lion" rows never read identically. A place with a
 * unique name gets no entry.
 *
 * Stores that share a name AND a town get their street line. When a street
 * line is missing or another store of that name in that town has the same
 * one, the store gets "Location 2 of 3" instead, numbered in slug order so
 * the label stays put between renders. Every store in a same-name, same-town
 * group therefore gets a distinct qualifier.
 *
 * A store that is the only one of its name in its town is already told apart
 * by the town, so it gets the town's display name when the caller supplies
 * `townName`, and nothing when the caller prints the town itself (the map
 * rows do).
 *
 * Same rule as the amenity list (AmenityFallbackList): qualify only the
 * labels that repeat, and leave every other row alone.
 */
export function duplicateNameQualifiers(
  places: readonly NamedPlace[],
  townName?: (municipality: string) => string | undefined,
): Map<string, string> {
  const byNameAndTown = new Map<string, NamedPlace[]>();
  const nameCount = new Map<string, number>();
  for (const place of places) {
    const name = place.name.replace(/\s+/g, " ").trim().toLowerCase();
    if (!name) continue;
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    const key = `${name}\u0000${place.municipality}`;
    const group = byNameAndTown.get(key);
    if (group) group.push(place);
    else byNameAndTown.set(key, [place]);
  }
  const qualifiers = new Map<string, string>();
  for (const [key, group] of byNameAndTown) {
    if ((nameCount.get(key.split("\u0000")[0]) ?? 0) < 2) continue;
    if (group.length === 1) {
      const town = townName?.(group[0].municipality);
      if (town) qualifiers.set(group[0].slug, town);
      continue;
    }
    const slugOrder = group.map((place) => place.slug).sort();
    const streets = group.map((place) => streetLine(place.address));
    const streetCount = new Map<string, number>();
    for (const street of streets) if (street) streetCount.set(street.toLowerCase(), (streetCount.get(street.toLowerCase()) ?? 0) + 1);
    group.forEach((place, index) => {
      const street = streets[index];
      const distinct = street !== undefined && streetCount.get(street.toLowerCase()) === 1;
      const rank = slugOrder.indexOf(place.slug) + 1;
      qualifiers.set(place.slug, distinct ? street : `Location ${rank} of ${group.length}`);
    });
  }
  return qualifiers;
}
