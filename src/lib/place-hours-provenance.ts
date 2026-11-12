import type { Place } from "@/data/places";
import { FCPL_BRANCHES, FCPL_CLOSURES_URL } from "@/lib/official-hours";

type HoursProvenanceInput = Pick<Place, "hours" | "hours_source" | "hours_updated_at">;

const SOURCE_LABELS = {
  google_places: "Google",
  first_party: "the official source",
  osm: "OpenStreetMap",
  manual_override: "the Frederick Radius team",
} as const;

const observedDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
});
const observedTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
});
const CLOCK_SKEW_MS = 5 * 60_000;

function observationTime(iso: string | undefined, nowMs: number): number | undefined {
  // Require an actual zoned timestamp, not a date or a host-local time.
  if (!iso) return undefined;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
  if (!match) return undefined;
  const day = Date.parse(match[1]);
  const time = Date.parse(iso);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]
    || !Number.isFinite(time) || !Number.isFinite(nowMs) || time > nowMs + CLOCK_SKEW_MS) return undefined;
  return time;
}

/** Name the evidence's actual source and observation, without renewing its age. */
export function placeHoursProvenance(place: HoursProvenanceInput, nowMs: number = Date.now()): string | undefined {
  const official = place.hours?._official;
  const knownLibrary = official && official.kind !== "merchant"
    && official.closures_url === FCPL_CLOSURES_URL
    && FCPL_BRANCHES.some(([slug, path]) => official.slug === slug
      && official.source_url === `https://www.fcpl.org/branches-hours/${path}`);
  const source = official
    ? official.source_name?.trim() || (knownLibrary ? "Frederick County Public Libraries" : SOURCE_LABELS.first_party)
    : place.hours_source ? SOURCE_LABELS[place.hours_source] : undefined;
  if (!source) return undefined;
  // An invalid official observation must not borrow another source's newer date.
  const timestamp = observationTime(official ? official.observed_at : place.hours_updated_at, nowMs);
  if (timestamp === undefined) return `Hours from ${source}.`;
  const date = new Date(timestamp);
  return `Hours from ${source}, observed ${observedDate.format(date)} at ${observedTime.format(date)} ET.`;
}
