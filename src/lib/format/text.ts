/**
 * Shared text sanitizers for feed-sourced strings.
 *
 * `cleanFeedText` moved here from `ical-live.ts` so the event
 * normalization layer can reuse the one decoder without importing the
 * network-heavy feed module. `ical-live.ts` re-exports it for
 * back-compat, so existing imports keep working. One decoder, one
 * source of truth.
 *
 * Rule reminder: user-facing copy carries no em dashes, so entity
 * decoding maps `&mdash;` to a comma and `&ndash;` to a hyphen rather
 * than to the dash glyphs.
 */

/**
 * Decode HTML entities, then strip stray tags, then collapse
 * whitespace. Decode runs first so an entity-encoded tag such as
 * `&lt;br&gt;` becomes `<br>` and is then removed, rather than
 * surviving as literal text. This is the bug the County RSS feed hit:
 * it double-encodes its HTML, so the description arrived as literal
 * `&lt;strong&gt; ... &lt;br&gt;` prose.
 */
/**
 * Realistic named HTML entities that live feeds (CivicEngage RSS, iCal,
 * Ticketmaster) actually emit beyond the basics handled inline below.
 * `&mdash;`/`&ndash;`/`&hellip;`/quotes are decoded earlier with custom
 * (non-glyph) replacements per the writing rule, so they're not here.
 */
const NAMED_ENTITIES: Record<string, string> = {
  bull: "•", middot: "·", deg: "°", trade: "™", reg: "®", copy: "©",
  times: "×", divide: "÷", frac12: "½", frac14: "¼", frac34: "¾",
  // common accented letters from event/venue/place names
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", aacute: "á",
  acirc: "â", auml: "ä", aring: "å", ouml: "ö", oacute: "ó", ocirc: "ô",
  uuml: "ü", uacute: "ú", iacute: "í", ntilde: "ñ", ccedil: "ç",
};

export function cleanFeedText(raw: string): string {
  const decoded = raw
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    // Writing rule: no em dashes in user-facing copy. A source feed's
    // em dash becomes a comma, an en dash becomes a hyphen.
    .replace(/&mdash;/gi, ", ")
    .replace(/&ndash;/gi, "-")
    .replace(/&hellip;/gi, "...")
    .replace(/&[lr]squo;/gi, "'")
    .replace(/&[lr]dquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    // Named entities feeds emit (bullets, fractions, accents) + a RESIDUAL
    // GUARD: any remaining unknown `&word;` becomes a space so a raw entity
    // (e.g. "&bull;") can never leak into body OR metadata. Runs after
    // `&amp;`→`&` above, so double-encoded "&amp;bull;" decodes correctly;
    // requires the trailing ";", so real ampersands like "C&O" are untouched.
    .replace(
      /&([a-z][a-z0-9]*);/gi,
      (_m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? " ",
    );
  return decoded
    .replace(/<[^>]+>/g, " ")
    // Literal em or en dash glyphs that arrive already decoded from a
    // source still violate the rule, so normalize them too.
    .replace(/—/g, ", ")
    .replace(/–/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recursively run `cleanFeedText` over every string in a value — the
 * boundary pass for hand-authored/agent-written JSON datasets
 * (field-notes.json, business-info.json) that bypass the feed pipeline
 * and the ESLint JSXText em-dash guard. Normalizing on read means a
 * curated note can never leak an em dash to a user. cleanFeedText is a
 * no-op on URLs, enums, and ISO dates (no tags/entities/dash glyphs),
 * so fields like source_url survive untouched.
 */
export function deepCleanStrings<T>(value: T): T {
  if (typeof value === "string") return cleanFeedText(value) as unknown as T;
  if (Array.isArray(value)) return value.map(deepCleanStrings) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepCleanStrings(v);
    return out as T;
  }
  return value;
}

/**
 * Scrape-fragment repair for one-line place blurbs. The DFP scrape cut some
 * blurbs mid-sentence, leaving fragments that read broken on a card:
 *   "is a family-owned … boutique"   (the place NAME was stripped)
 *   "com 301-266- Peaceful Massage Studio …" (domain tail + partial phone)
 *   "museum in downtown Frederick."  (template fragment, lowercase start)
 * Boundary cleaning per the data-pipeline rule: fix here once, never at
 * render. A no-op on already-clean sentences.
 */
export function cleanBlurbFragment(blurb: string): string {
  let b = blurb.trim();
  // Domain-tail + phone debris before the real sentence starts.
  const debris = b.match(/^[a-z]{2,6}\s+[\d()\s.-]{4,}\s*(?=[A-Z])/);
  if (debris) b = b.slice(debris[0].length);
  // Name-stripped copula: "is a family-owned…" → "A family-owned…".
  b = b.replace(/^is\s+(a|an|the)\s+/i, (_m, art: string) => `${art[0].toUpperCase()}${art.slice(1).toLowerCase()} `);
  // Any remaining lowercase start reads as a fragment — sentence-case it.
  if (/^[a-z]/.test(b)) b = b[0].toUpperCase() + b.slice(1);
  return b;
}

/**
 * Fix the two address-concatenation bugs the county and DFP feeds
 * produce, where a street suffix runs straight into the city with no
 * separator:
 *
 *   "12 E Church St.Frederick, MD 21701"  ->  "12 E Church St., Frederick, MD 21701"
 *   "310 Baughmans LaneFrederick, MD"     ->  "310 Baughmans Lane, Frederick, MD"
 *   "...MD21701"                          ->  "...MD 21701"
 *
 * Deliberately conservative: it only acts on the no-separator cases
 * (suffix immediately followed by a capital, or an abbreviation period
 * immediately followed by a capital). It does NOT touch a suffix
 * followed by a normal space, because "Market St Stage" is a legitimate
 * venue string and inserting a comma there would be wrong. Run
 * `cleanFeedText` first so entities and tags are already gone.
 */
export function formatAddress(raw: string): string {
  if (!raw) return raw;
  return raw
    // Abbreviation + period directly before a capital: "St.Frederick".
    .replace(/\b(St|Ave|Rd|Dr|Ln|Blvd|Ct|Pl|Ter|Cir|Hwy|Pkwy)\.(?=[A-Z])/g, "$1., ")
    // Full-word suffix directly before a capital, no space: "LaneFrederick".
    .replace(
      /\b(Street|Avenue|Road|Drive|Lane|Boulevard|Court|Place|Terrace|Circle|Highway|Parkway|Pike|Way)(?=[A-Z])/g,
      "$1, ",
    )
    // State code mashed into ZIP: "MD21701".
    .replace(/\b(MD|DC|VA|WV|PA)(\d{5})\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
