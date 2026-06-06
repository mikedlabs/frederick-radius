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
