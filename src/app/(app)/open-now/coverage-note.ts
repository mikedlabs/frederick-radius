/**
 * The one sentence on /open-now that says how much of the county the list
 * can speak for. "21 places are confirmed open" reads as the whole county
 * unless the page also says that only some places have current hours at all
 * (November 2026 feedback review). It is supporting detail under the lede,
 * never the headline, and it uses the same request-time count /trust prints.
 *
 * The numbers are always countywide, so the sentence says so: in a town
 * scope the lede counts the town's rows while this count covers the county.
 *
 * Returns null when there is nothing honest to add: no place has current
 * hours (the lede already says so), or every place does.
 */
export function hoursCoverageNote(current: number, total: number): string | null {
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
  if (current <= 0 || current >= total) return null;
  const count = (value: number) => Math.round(value).toLocaleString("en-US");
  return `Radius has current hours for ${count(current)} of ${count(total)} places countywide, so more may be open.`;
}

export type OpenNowHeaderCopy = {
  lede: string;
  /** Only ever set beside the count lede. */
  coverageNote: string | null;
};

/**
 * The lede under the /open-now title and the coverage sentence that may
 * follow it. The coverage sentence belongs only with the count lede: "so
 * more may be open" needs a count to be more than, and after "No county
 * listings have recently checked hours..." it would read as a contradiction.
 * It also stays out when the coverage count, which comes from a different
 * reader than the list, would be smaller than the confirmed-open count.
 */
export function openNowHeaderCopy({
  confirmedOpen,
  likelyOpen,
  currentHours,
  totalPlaces,
}: {
  confirmedOpen: number;
  likelyOpen: number;
  /** Null when the public data snapshot could not be built. */
  currentHours: number | null;
  totalPlaces: number | null;
}): OpenNowHeaderCopy {
  if (confirmedOpen > 0) {
    const coverageNote =
      currentHours !== null && totalPlaces !== null && currentHours >= confirmedOpen
        ? hoursCoverageNote(currentHours, totalPlaces)
        : null;
    return {
      lede: `${confirmedOpen} ${confirmedOpen === 1 ? "place is" : "places are"} confirmed open.`,
      coverageNote,
    };
  }
  return {
    lede: likelyOpen > 0
      ? "Some places are usually open at this hour. Check with the venue before going."
      : "No county listings have recently checked hours confirming they are open.",
    coverageNote: null,
  };
}
