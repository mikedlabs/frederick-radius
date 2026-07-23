import type { EventWithMeta } from "@/lib/loaders/events";
import { getEventBySlug } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { getIngestedCardBySlug } from "@/lib/loaders/ingestedEvents";
import { hasActionableAttendance } from "@/lib/events/attendance";

export type EventResolutionKind = "seed" | "unified" | "live" | "ingested";

export type ResolvedEventPage = {
  event: EventWithMeta;
  kind: EventResolutionKind;
};

type EventResolverSources = {
  seed: (slug: string) => EventWithMeta | null;
  unified: (now: Date) => Promise<EventWithMeta[]>;
  live: (slug: string) => Promise<EventWithMeta | null>;
  ingested: (slug: string) => Promise<EventWithMeta | null>;
};

const DEFAULT_SOURCES: EventResolverSources = {
  seed: getEventBySlug,
  unified: async (now) => (await assembleUnifiedEvents(now)).publicEvents,
  live: getLiveCardEventBySlug,
  ingested: getIngestedCardBySlug,
};

/**
 * Resolve the event-detail page from the same cached public set that emitted
 * its link before consulting any source-specific fallback.
 *
 * This ordering is load-bearing. The event sheet and event-list surfaces read
 * assembleUnifiedEvents, while the old detail route rebuilt seven upstream
 * feeds with independent six-second deadlines. A cold or slow provider could
 * therefore make a card visible and its "See full page" link return a
 * temporary 404. The stable unified snapshot is now the first live lookup, so
 * every event currently visible in the app remains resolvable even while an
 * upstream refresh is degraded. The 90-day live and ingested resolvers remain
 * as fallbacks for older shared links that have left the current list window.
 */
export async function resolveEventPageBySlugWithSources(
  slug: string,
  now: Date,
  sources: EventResolverSources,
): Promise<ResolvedEventPage | null> {
  const seed = sources.seed(slug);
  if (seed && hasActionableAttendance(seed)) return { event: seed, kind: "seed" };

  try {
    const listed = (await sources.unified(now)).find((event) => event.slug === slug);
    if (listed && hasActionableAttendance(listed)) return { event: listed, kind: "unified" };
  } catch {
    // A failed unified read must not break older deep links. Continue through
    // the narrower source resolvers, which are independently fail-soft.
  }

  try {
    const live = await sources.live(slug);
    if (live && hasActionableAttendance(live)) return { event: live, kind: "live" };
  } catch {
    // Keep trying the committed/DB-ingested event path.
  }

  try {
    const ingested = await sources.ingested(slug);
    if (ingested && hasActionableAttendance(ingested)) return { event: ingested, kind: "ingested" };
  } catch {
    // A true miss is represented as null; detail callers preserve an honest
    // HTTP 404 instead of returning a soft fallback page.
  }

  return null;
}

export function resolveEventPageBySlug(
  slug: string,
  now: Date = new Date(),
): Promise<ResolvedEventPage | null> {
  return resolveEventPageBySlugWithSources(slug, now, DEFAULT_SOURCES);
}
