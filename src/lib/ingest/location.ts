/**
 * CivicEngage LOCATION field cleanup. Input is the dirtiest part of the
 * payload — inline HTML, a " - " separator between venue and street, and
 * occasional free-text. Per spec this is its own tested module; expect to
 * keep refining as new edge cases appear (callers log unparseable ones).
 *
 * Examples seen in the wild:
 *   "<p>Multipurpose Room</p> - 121 N Bentz St  Frederick MD 21701"
 *   "Baker Park - Bandshell, Frederick, MD"
 *   "121 N Bentz St Frederick MD 21701"           (no venue)
 *   "Community Pool"                                (no address)
 *   ""                                              (empty)
 */

export type ParsedLocation = {
  venueName?: string;
  address?: string;
  /** Normalized address used as the geocode cache key */
  normAddress?: string;
  /** True when we couldn't extract anything address-like */
  unparseable: boolean;
};

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Looks like a US street address: starts with a number + words, optionally
// city/state/zip. Also matches just a "MD 21701"-style tail.
const STREET_RE = /\d{1,6}\s+[\w.'-]+(?:\s+[\w.'-]+)*\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|sq|square|pike|trail|trl)\b/i;
const STATE_ZIP_RE = /\bMD\s*\d{5}(?:-\d{4})?\b/i;

export function parseLocation(raw: string | undefined | null): ParsedLocation {
  if (!raw) return { unparseable: true };
  const clean = stripHtml(raw);
  if (!clean) return { unparseable: true };

  let venueName: string | undefined;
  let addressPart: string = clean;

  // CivicEngage uses " - " between venue and street. Split on the FIRST
  // " - " only (street addresses can contain hyphens in zip+4 etc.).
  const dashIdx = clean.indexOf(" - ");
  if (dashIdx > -1) {
    venueName = clean.slice(0, dashIdx).trim() || undefined;
    addressPart = clean.slice(dashIdx + 3).trim();
  }

  const streetMatch = STREET_RE.exec(addressPart);
  const hasStreet = Boolean(streetMatch);
  const hasStateZip = STATE_ZIP_RE.test(addressPart);

  if (hasStreet && streetMatch) {
    // CivicEngage often puts a building or room name directly before the
    // street with no separator: "Warehouse Cinema 1301 W Patrick Street…".
    // Sending that entire string to Google creates avoidable ZERO_RESULTS.
    // Preserve the useful prefix as the venue, but geocode from the exact
    // street number onward.
    const inlineVenue = addressPart
      .slice(0, streetMatch.index)
      .replace(/^[\s,–—-]+|[\s,–—-]+$/g, "")
      .trim();
    if (inlineVenue) {
      venueName = venueName
        ? `${venueName}, ${inlineVenue}`
        : inlineVenue;
    }
    const address = addressPart
      .slice(streetMatch.index)
      .replace(/\s+,/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    return {
      venueName,
      address,
      normAddress: normalizeForCache(address),
      unparseable: false,
    };
  }

  // A town plus ZIP is useful display context, but it is not a street-level
  // location. Geocoding it and later displaying the returned town centroid as
  // an exact event pin breaks Radius's location contract. Keep the text as a
  // venue/area label and let downstream surfaces mark location as approximate.
  if (hasStateZip) {
    return {
      venueName: venueName ?? clean.replace(/^[\s,–—-]+/, ""),
      address: undefined,
      normAddress: undefined,
      unparseable: false,
    };
  }

  // No street/zip: the whole thing is likely a venue name (e.g. "Community
  // Pool", "Baker Park"). Keep it as venue, no address — still a usable event,
  // just not geocodable from this field alone.
  return {
    venueName: venueName ?? clean,
    address: undefined,
    normAddress: undefined,
    unparseable: !venueName && !clean ? true : false,
  };
}

/** Cache key: lowercased, punctuation-stripped, whitespace-collapsed. */
export function normalizeForCache(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\bsuite\b|\bste\b|\bunit\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
