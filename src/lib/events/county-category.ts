/**
 * Title-only category for Frederick County Government calendar rows.
 *
 * County RSS has no category element, and CivicEngage catIDs are
 * unreliable (P0-5). The generic keyword matcher stays off: descriptions
 * list invited council members, and civic routes events into the
 * meetings lane. Public bodies stay in the data as civic so
 * classifyEvent can tuck them off Today and the default /events list
 * without painting them Community.
 */

const COUNTY_PUBLIC_BODY =
  /\b(?:board|commission|committee|council|advisory|authority)(?:\s+meeting)?$/i;

function countyTitleCore(title: string): string {
  // CivicEngage often appends a broadcast note: "Police Accountability
  // Board (Webstream on FCG TV 2 Only)". The body word still has to sit
  // at the end of the real title, or immediately before "Meeting".
  return title.replace(/\s*[(\[].*$/, "").trim();
}

/** Title-only (plus a Gaver Farm venue match). Never reads a description. */
export function countyCategory(title: string, venue?: string): string {
  if (COUNTY_PUBLIC_BODY.test(countyTitleCore(title))) return "civic";
  const farmHaystack = `${title} ${venue ?? ""}`;
  if (/\bgaver\s+farm\b/i.test(farmHaystack)) return "agritourism";
  if (/\bthea(?:ter|tre)\b/i.test(title)) return "theater";
  if (/\bpark\s+walk\b|\bhike\b|\btrail\b/i.test(title)) return "outdoors";
  return "community";
}

/**
 * Stored-copy fill: apply the county title-only rule only when the row
 * is the county calendar and its stored category is blank. Every other
 * source keeps the category it already has.
 */
export function storedCopyCategory(
  source: string,
  storedCategory: string | null | undefined,
  title: string,
  venue?: string | null,
): string {
  const blank = storedCategory == null || storedCategory.trim() === "";
  if (source === "county" && blank) {
    return countyCategory(title, venue ?? undefined);
  }
  return storedCategory ?? "community";
}
