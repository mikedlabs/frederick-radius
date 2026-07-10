/**
 * Junk-blurb detector for discovered/scraped places (2026-07 audit: ~32
 * short_blurbs in the client dataset were scrape artifacts, not sentences).
 *
 * The DFP scrape harvested whatever text block sat near the business name,
 * so some blurbs are directory boilerplate ("More info about JKW Beauty ;
 * 504 N Market St"), Yelp/Facebook chrome ("977 likes · 12 were here"),
 * bare address dumps ("205 Broadway St, Frederick, MD, 21701-6682 205
 * Broadway St, Frederick, MD 21701, USA"), review counters ("4 Reviews"),
 * or the place's own name restated. No repair can turn those into a
 * sentence, so the boundary (decoratePlace in @/lib/loaders/places) DROPS
 * them: a card with no blurb beats a card with debris.
 *
 * DELIBERATELY CONSERVATIVE, per the data-pipeline rule that a real
 * sentence must never be dropped. Every pattern is anchored to a shape no
 * editorial sentence takes (state+ZIP tails, "N likes ·" counters, a
 * capitalized street fragment and nothing else). Truncated but real prose
 * ("She brings a lifetime of engagement in compassionately helping") is
 * KEPT: when unsure, keep.
 */

/** Lowercased alphanumeric core of a token; "" for pure punctuation. */
function normTok(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Strip the place's own name off the front and/or back of the blurb —
 * scraped blurbs very often lead with the business name ("Jkw Beauty More
 * info about…") and sometimes repeat it at the end. Punctuation- and
 * case-insensitive ("Bill and Earl's" matches "Bill and Earls"). The
 * prefix pass strips leading blurb words that appear IN the name in
 * order, so "Dr Elise" still strips the "Elise" the scrape kept. The
 * junk tests below then judge only what the blurb says BEYOND the name.
 */
function stripName(blurb: string, name?: string): string {
  const toks = blurb.trim().split(/\s+/);
  const nameToks = (name ?? "").split(/\s+/).map(normTok).filter(Boolean);
  if (nameToks.length === 0) return blurb.trim();
  // Prefix pass: leading blurb tokens that are name words, in order.
  let i = 0;
  let j = 0;
  while (i < toks.length && j < nameToks.length) {
    const t = normTok(toks[i]);
    if (!t) {
      i++; // pure-punctuation token between name words
      continue;
    }
    let jj = j;
    while (jj < nameToks.length && nameToks[jj] !== t) jj++;
    if (jj === nameToks.length) break;
    j = jj + 1;
    i++;
  }
  let rest = toks.slice(i);
  // Suffix pass: the whole name repeated at the tail, in reverse order.
  const revName = [...nameToks].reverse();
  let k = rest.length - 1;
  let m = 0;
  while (k >= 0 && m < revName.length) {
    const t = normTok(rest[k]);
    if (!t) {
      k--;
      continue;
    }
    if (t !== revName[m]) break;
    k--;
    m++;
  }
  if (m === revName.length) rest = rest.slice(0, k + 1);
  return rest.join(" ").replace(/^[\s,;:·|–-]+|[\s,;:·|–-]+$/g, "");
}

/** Directory/scrape boilerplate no editorial sentence contains. */
const BOILERPLATE: RegExp[] = [
  // "More info about JKW Beauty ; 504 N Market St" (directory link text)
  /\bmore info about\b/i,
  // Yelp's own footer copy scraped as if it described the business
  /\byelp is a fun and easy way\b/i,
  // "See reviews, map, get the address, and find directions"
  /\bsee reviews?, map, get the address\b/i,
  // Yelp listing dump: "…, 20 Photos, (240) 575-9256, Mon - Closed, …"
  /\b\d+\s+photos?,\s*\(\d{3}\)\s*\d{3}/i,
  // Facebook counters: "977 likes · 12 were here"
  /\b\d[\d,]*\s+likes?\s*·/i,
  // Contact line whose contact details the scrape stripped:
  // "Contact us at or visit us at 801 Toll house ave, …"
  /\bcontact us at\s+or\s+visit us at\b/i,
];

/**
 * Google-Maps address mash: "…MD 21703, USASchedule an appointment" /
 * "…MD 20877, USA382 N Summit Ave". A ", USA" glued straight into the
 * next scrape block is a pure artifact signature.
 */
const USA_MASH = /\b\d{5}(?:-\d{4})?,?\s*USA[A-Za-z0-9]/;

/** "MD 21701" / "Maryland, 21701-6682" (+ optional "United States"). */
const STATE_ZIP =
  /\b(?:MD|Maryland)\b[.,\s]*(?:United States[.,\s]*)?\d{5}(?:-\d{4})?/;

/**
 * Remainder is ONLY "City, MD 21701" — optionally a capitalized street
 * line before it, optionally a phone after it. Every leading word must be
 * capitalized, so real prose ("in the heart of Frederick, MD 21701")
 * never matches.
 */
const CITY_STATE_ZIP_ONLY =
  /^(?:[A-Z][A-Za-z.'’-]*[,|\s]+){0,7}\b(?:MD|Maryland)\b[,\s]*\d{5}(?:-\d{4})?\s*(?:\(\d{3}\)\s*\d{3}[-.\s]?\d{4})?$/;

/**
 * Remainder is ONLY a street fragment: "504 N Market St", "Patrick St",
 * "Ste 205". Capitalized words only, tight length, must end at the
 * suffix (or a unit number) — a sentence can't take this shape.
 */
const STREET_FRAGMENT_ONLY =
  /^(?:\d+[A-Za-z]?\s+)?(?:[NSEW]\.?\s+)?(?:[A-Z][A-Za-z.'’]*\s+){0,4}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Pl|Place|Pike|Ter|Terrace|Cir|Circle|Hwy|Pkwy|Way|Ste|Suite)\.?(?:\s*#?\s*\d+[A-Za-z]?)?$/;

/** A dangling house number the scrape cut mid-address: "371 W". */
const DANGLING_STREET_NUMBER = /^\d{1,6}\s*[NSEW]?\.?$/;

/** Review counter and nothing else: "4 Reviews". */
const REVIEW_COUNT_ONLY = /^\(?\d[\d,]*\)?\s*reviews?\.?$/i;

/**
 * Bare address dump: starts at a house number, reaches a state+ZIP, and
 * anything after the last ZIP is still address material (the scrape often
 * doubled the address: "…MD, 21701 11 W Patrick St Ste 300"). Refuses to
 * fire if the text contains a sentence break — a blurb that merely opens
 * with an address keeps its prose and is kept.
 */
function isAddressDump(r: string): boolean {
  if (!/^\d+[A-Za-z]?\s/.test(r)) return false;
  if (!STATE_ZIP.test(r)) return false;
  // Sentence punctuation (ignoring St./Ave.-style abbreviation dots)
  // means prose — keep.
  const noAbbrev = r.replace(
    /\b(?:St|Ave|Rd|Dr|Ln|Blvd|Ct|Pl|Ste|Mt|N|S|E|W|Mr|Mrs|Ms)\./g,
    (m) => m.slice(0, -1),
  );
  if (/[.!?](?:\s|$)/.test(noAbbrev.replace(/\d{5}-\d{4}/g, ""))) return false;
  const after = r
    .split(new RegExp(STATE_ZIP.source, "g"))
    .pop()!
    .replace(/^[.,\s]*(?:USA)?[.,\s]*/, "");
  if (!after) return true;
  // Every remaining token must look like address material (capitalized
  // word, number, or unit marker) — one lowercase prose word keeps it.
  return after.split(/\s+/).every((t) => /^[#\d(]|^[A-Z]/.test(t));
}

/**
 * Site-chrome link words: a remainder made ONLY of these (plus
 * separators) is scraped navigation, not a description.
 */
const NAV_WORDS = new Set([
  "twitter", "facebook", "instagram", "youtube", "tiktok", "linkedin",
  "map", "menu", "details", "directions", "website", "home", "about",
  "aboutus", "contact", "contactus", "reviews", "schedule", "register",
  "gallery", "services", "hours", "faq", "booknow", "bookonline",
  "learnmore", "readmore", "more", "call", "email",
]);

function isNavDebris(text: string): boolean {
  const parts = text
    .split(/[·;|,/&]+|\s+/)
    .map(normTok)
    .filter(Boolean);
  if (parts.length === 0) return false;
  // Allow two-word links ("Contact Us") by also testing joined pairs.
  let i = 0;
  while (i < parts.length) {
    if (NAV_WORDS.has(parts[i])) {
      i += 1;
    } else if (i + 1 < parts.length && NAV_WORDS.has(parts[i] + parts[i + 1])) {
      i += 2;
    } else {
      return false;
    }
  }
  return true;
}

/** Truncated email tail ("hello@7thsister" — no TLD survived the cut). */
const TRUNCATED_EMAIL_TAIL = /\S+@[A-Za-z0-9-]*$/;
const INTACT_EMAIL_TAIL = /@[A-Za-z0-9-]+\.[A-Za-z]{2,}\s*$/;

/**
 * True when a short_blurb is scrape debris that should be dropped at the
 * boundary rather than rendered. Pass the place's `name` so a leading
 * "Business Name " prefix (the most common scrape shape) doesn't disguise
 * an address dump as prose.
 */
export function isJunkBlurb(blurb: string, name?: string): boolean {
  const b = blurb.trim();
  if (!b) return false; // nothing to judge; empty is handled by callers
  if (BOILERPLATE.some((re) => re.test(b))) return true;
  if (USA_MASH.test(b)) return true;

  const r = stripName(b, name);
  // Blurb was the name (or the name twice) and nothing else — or only
  // symbols/private-use glyphs beyond it. A terminal sentence mark means
  // someone wrote it on purpose; keep those.
  const residue = normTok(stripName(r, name));
  if (residue.length < 3 && !/[.!?]$/.test(b)) return true;

  if (REVIEW_COUNT_ONLY.test(r)) return true;
  if (isNavDebris(r)) return true;
  if (DANGLING_STREET_NUMBER.test(r)) return true;
  if (STREET_FRAGMENT_ONLY.test(r)) return true;
  if (isAddressDump(r)) return true;
  if (CITY_STATE_ZIP_ONLY.test(r)) return true;
  // Address block ending in an email the scrape cut mid-domain
  // ("…Frederick, MD 21701 hello@7thsister").
  if (
    STATE_ZIP.test(r) &&
    TRUNCATED_EMAIL_TAIL.test(r) &&
    !INTACT_EMAIL_TAIL.test(r)
  ) {
    return true;
  }
  return false;
}
