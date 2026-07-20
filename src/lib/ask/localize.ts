/**
 * When should an Ask answer offer to localize itself?
 *
 * The bug (owner, 2026-07-20): a proximity query without the words "near me"
 * ("where can I rent a bike") never triggered the location gate, so Ask
 * answered county-wide and buried the closest option. The gate wording is
 * only ONE trigger; this predicate adds the other — any answer that already
 * named real places, when Radius has no location and no town is pinned, can
 * be re-ranked by proximity, so it offers a one-tap "use my location."
 *
 * Pure so the "when to show it" rule is unit-tested without the (keyed) Ask
 * API or a browser.
 */
export function answerCanLocalize(opts: {
  /** An answer is on screen. */
  hasResult: boolean;
  /** The request errored (rate limit / network / service) — no offer then. */
  requestFailure: boolean;
  /** The answer cited at least one /places/… match to re-rank. */
  hasPlaceMatch: boolean;
  /** Radius already has the user's device position — nothing to offer. */
  hasDevicePosition: boolean;
  /** A specific town is pinned as the scope — the user chose an area already. */
  townScoped: boolean;
  /** There is a submitted query to re-run with the position. */
  hasQuery: boolean;
}): boolean {
  return (
    opts.hasResult &&
    !opts.requestFailure &&
    opts.hasPlaceMatch &&
    !opts.hasDevicePosition &&
    !opts.townScoped &&
    opts.hasQuery
  );
}
