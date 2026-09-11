import type { MapDiscoveryEvidence } from "./mapDiscoveries";
import type { EventPin } from "./types";
import { openNowCountLabel } from "@/lib/hours-availability";

const EASTERN = "America/New_York";

/**
 * A compact, honest source timestamp for map cards. Absolute time is used
 * instead of a render-time "N minutes ago" claim so server snapshots stay
 * truthful after hydration and shared screenshots still make sense.
 */
export function formatMapTimestamp(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * The trust line shown on a selected map finding. Sources are deduplicated and
 * capped so the proof is visible without turning the mobile peek into a wall
 * of provenance. A date appears only when evidence carries a real observation
 * timestamp; undated records are never made to look freshly checked.
 */
export function discoveryTrustLine(evidence: MapDiscoveryEvidence[]): string {
  const sources = [...new Set(evidence.map((item) => item.source.trim()).filter(Boolean))];
  const shown = sources.slice(0, 2);
  const sourceText = shown.length === 0
    ? "Source details available"
    : shown.join(" + ") + (sources.length > shown.length ? ` +${sources.length - shown.length}` : "");

  const dated = evidence
    .map((item) => item.observedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time)[0];
  const observed = dated ? formatMapTimestamp(dated.value) : null;

  return observed
    ? `Sources: ${sourceText} · dated ${observed}`
    : `Sources: ${sourceText}`;
}

/** The two facts that earn space in Radius mode's always-visible mobile peek. */
export function radiusResultLine(
  places: number,
  openNow: number,
  openOnly = false,
  mayReportNoneOpen = false,
): string {
  if (places === 0) return "No places within reach";
  if (openOnly) {
    if (openNow > 0) {
      return `${openNow.toLocaleString("en-US")} confirmed open within reach`;
    }
    return mayReportNoneOpen
      ? "None open within reach"
      : "Open hours unconfirmed within reach";
  }
  return `${places.toLocaleString("en-US")} ${places === 1 ? "place" : "places"} · ${openNowCountLabel(openNow, mayReportNoneOpen)}`;
}

/**
 * The cold Contents button should say what the map is currently doing, not
 * display a mystery count. Keep the readout to two short facts so it survives
 * a narrow phone: the chosen area and the strongest active task.
 */
export function mapContentsSummary({
  area,
  amenity,
  intent,
  time,
  layer,
}: {
  area: string;
  amenity?: string;
  intent?: string;
  time?: string;
  layer?: string;
}): string {
  const task = amenity ?? intent ?? time ?? layer;
  return task ? `${area} · ${task}` : "Contents";
}

export type MapEventGroup = {
  id: string;
  lng: number;
  lat: number;
  venueLabel: string;
  events: EventPin[];
};

/**
 * Events often share an exact venue coordinate. Drawing one 44px marker per
 * occurrence makes a flower of overlapping buttons that is hard to tap and
 * can extend far from the actual venue. Group points within roughly one
 * downtown block, retain every event in chronological order, and let the map
 * render one honest count marker that opens the list.
 */
export function groupMapEvents(
  events: readonly EventPin[],
  coordinatePrecision = 4,
): MapEventGroup[] {
  const grouped = new Map<string, EventPin[]>();
  for (const event of events) {
    const key = `${event.lng.toFixed(coordinatePrecision)}:${event.lat.toFixed(coordinatePrecision)}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  return [...grouped.entries()]
    .map(([id, bucket]) => {
      const ordered = [...bucket].sort(
        (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
      );
      const venues = [...new Set(ordered.map((event) => event.venue_name.trim()).filter(Boolean))];
      return {
        id,
        lng: ordered[0].lng,
        lat: ordered[0].lat,
        venueLabel: venues.length === 1 ? venues[0] : "Events here",
        events: ordered,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(a.events[0].starts_at) - Date.parse(b.events[0].starts_at) ||
        a.id.localeCompare(b.id),
    );
}
