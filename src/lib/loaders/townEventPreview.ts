import { MUNICIPALITY_BY_SLUG, type Municipality } from "@/data/municipalities";
import { hasPhysicalAttendance } from "@/lib/events/attendance";
import { isUpcomingEvent } from "@/lib/events/visible";
import { haversineMeters } from "@/lib/geo";
import type { EventWithMeta } from "./events";
import { loadEventArchiveSnapshot, logEventArchiveFailure } from "./todayEventSnapshot";

function townSlug(value: string | undefined) {
  const slug = value?.trim().toLowerCase().replace(/^(?:city|town|village) of /, "")
    .replace(/,\s*(?:md|maryland)$/, "").replace(/\s+/g, "-");
  return slug && Object.hasOwn(MUNICIPALITY_BY_SLUG, slug) ? slug : undefined;
}

function eventTown(event: EventWithMeta) {
  const fromField = townSlug(event.municipality);
  const fromName = townSlug(event.municipality_name);
  if (fromField && fromName && fromField !== fromName) return undefined;
  return fromField || fromName;
}

/** Reuses the Events board's bounded, cached collection and its degraded fallback. */
export async function getTownEventPreview(town: Municipality, now: Date) {
  const snapshot = await loadEventArchiveSnapshot(now, { cache: true }).catch((error: unknown) => {
    logEventArchiveFailure("Town event preview unavailable", error);
    return null;
  });
  if (!snapshot) return { local: [], nearby: undefined, degraded: true };
  const upcoming = snapshot.publicEvents.filter((event) => event.status !== "cancelled" &&
    event.status !== "postponed" && hasPhysicalAttendance(event) && isUpcomingEvent(event, now));
  const local = upcoming.filter((event) => eventTown(event) === town.slug)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, 3);
  const nearby = local.length ? undefined : upcoming
    .filter((event) => {
      const slug = eventTown(event);
      return slug && slug !== town.slug && (event.geo_confidence === "exact_address" || event.geo_confidence === "venue_match");
    })
    .map((event) => ({ event, distance: haversineMeters(town.centroid, event.geom) }))
    .filter(({ distance }) => distance <= 16_000)
    .sort((a, b) => a.distance - b.distance || Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at))[0]?.event;
  return { local, nearby, degraded: snapshot.sourceHealth.degraded };
}
