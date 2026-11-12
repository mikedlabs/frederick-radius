/** A venue occurrence owns its route even when another show is added or removed.
 * Keep the Eastern date last for existing dated-link recovery. The complete UTC instant
 * distinguishes 25-hour days, DST folds, seconds and milliseconds.
 */
export function venueOccurrenceSlug(baseSlug: string, venueSlug: string, startsAt: string): string {
  const match = /^(.*)-(\d{4}-\d{2}-\d{2})$/.exec(baseSlug);
  const start = Date.parse(startsAt);
  if (!match || !Number.isFinite(start) || !/^[a-z0-9][a-z0-9-]*$/.test(venueSlug)) {
    throw new Error("A venue occurrence needs a valid slug, venue and start.");
  }
  const instant = new Date(start).toISOString().replace(/[-:T.Z]/g, "");
  const identity = `${venueSlug}-${instant}z-${match[2]}`;
  const available = 200 - identity.length - 1;
  const title = match[1].slice(0, available).replace(/-+$/, "");
  if (available < 1 || !title) throw new Error("A venue occurrence cannot fit its route identity.");
  return `${title}-${identity}`;
}

type TimedSource = { title: string; source?: string; source_id?: string; starts_at: string };

/** Only exact official venue siblings bypass approximate duplicate detection. */
export function areDistinctVenuePerformances(a: TimedSource, b: TimedSource): boolean {
  if (a.source !== "venue-extract" || b.source !== "venue-extract" || a.title !== b.title) return false;
  const left = /^venue:([a-z0-9][a-z0-9-]*):(.+)$/.exec(a.source_id ?? "");
  const right = /^venue:([a-z0-9][a-z0-9-]*):(.+)$/.exec(b.source_id ?? "");
  const startA = Date.parse(a.starts_at), startB = Date.parse(b.starts_at);
  return !!left && !!right && left[1] === right[1] && a.source_id !== b.source_id &&
    Number.isFinite(startA) && Number.isFinite(startB) && startA !== startB &&
    left[2] === new Date(startA).toISOString() && right[2] === new Date(startB).toISOString();
}
