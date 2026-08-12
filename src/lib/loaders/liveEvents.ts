/**
 * Live-feed events adapted to the shared card/detail shape, plus a
 * by-slug resolver.
 *
 * Server-only: this pulls getLiveEvents (a network fetch over the iCal /
 * RSS sources) so it must never be imported into a client component.
 * Both the /events index and the /events/[slug] detail route import from
 * here, so a live event renders the same way in-app and a shared
 * /events/<slug> link resolves instead of hitting notFound().
 */
import { stampEventProvenance } from "@/lib/provenance";
import { audienceFromText } from "@/lib/events/audienceSignals";
import { getCachedLiveEvents, liveEventSlug, type LiveEvent } from "@/lib/integrations/ical-live";
import { fetchTicketmasterSports } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { BANDSINTOWN_ARTISTS } from "@/data/bandsintown-artists";
import { fetchVisitFrederick } from "@/lib/integrations/visitfrederick";
import { fetchFrederickKeys } from "@/lib/integrations/frederickKeys";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import {
  venueEventsAsCards,
  venueEventsToCards,
  type VenueEvent,
} from "@/lib/loaders/venueEvents";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
import { upgradeEventGeom } from "@/lib/integrations/mapboxGeocode";
import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import { normalizeTitle, etYear, cleanEventSlug } from "@/lib/events/normalize";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { isPromotedDataBuild } from "@/lib/data-release-mode";
import {
  eventAttendanceMode,
  isLikelyEventActionUrl,
} from "@/lib/events/attendance";

/**
 * The one clean-slug authority for a live event. Both liveToCardEvent
 * (the slug it stamps on the card) and getLiveCardEventBySlug (the
 * resolver) call this, so the link a card emits is exactly the link the
 * detail route resolves. Form: kebab(presenter + title)-YYYY-MM-DD, no
 * "live-" prefix, no mashed address, no timestamp.
 */
export function liveCleanSlug(e: Pick<LiveEvent, "title" | "starts_at">): string {
  const { presenter, title } = normalizeTitle(e.title, { year: etYear(e.starts_at) });
  return cleanEventSlug({ presenter, title, startsAt: e.starts_at });
}

/** Worst-case wall time the slug resolver may spend awaiting any one source.
 * A timed-out source remains incomplete evidence; it is never converted into
 * a definitive empty result. */
const SLUG_SOURCE_TIMEOUT_MS = 6_000;

type LiveSlugCandidate = {
  event: EventWithMeta;
  needsGeomUpgrade: boolean;
};

type LiveSlugProviderOutcome =
  | {
      source: string;
      status: "hit";
      candidate: LiveSlugCandidate;
    }
  | {
      source: string;
      status: "miss" | "failed" | "timeout" | "aborted";
    };

/**
 * A provider that never completed is not evidence that an event does not
 * exist. The page-level resolver converts this to its unavailable/timeout
 * state instead of rendering a false 404.
 */
export class LiveEventLookupIncompleteError extends Error {
  constructor(public readonly sources: readonly string[]) {
    super(`Live event lookup did not complete: ${sources.join(", ")}`);
    this.name = "LiveEventLookupIncompleteError";
  }
}

function matchingLiveEvent(
  events: readonly LiveEvent[],
  slug: string,
): LiveEvent | undefined {
  const cleanHit = events.find((event) => liveCleanSlug(event) === slug);
  if (cleanHit || !slug.startsWith("live-")) return cleanHit;
  return events.find((event) => liveEventSlug(event) === slug);
}

/**
 * Resolve one provider independently. A settled miss is distinct from a
 * timeout, failure, or abort so the caller only returns null when every source
 * supplied a definitive answer. The `stopped` flag prevents a late losing
 * promise from running its adapter after another provider has already won.
 */
function resolveLiveSlugProvider<T>({
  source,
  load,
  match,
  timeoutMs,
  signal,
}: {
  source: string;
  load: () => Promise<T>;
  match: (value: T) => LiveSlugCandidate | null;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<LiveSlugProviderOutcome> {
  if (signal.aborted) {
    return Promise.resolve({ source, status: "aborted" });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let removeAbort: (() => void) | undefined;

  const guarded = Promise.resolve()
    .then(load)
    .then(
      (value): LiveSlugProviderOutcome => {
        if (stopped || signal.aborted) {
          return { source, status: "aborted" };
        }
        const candidate = match(value);
        return candidate
          ? { source, status: "hit", candidate }
          : { source, status: "miss" };
      },
      (): LiveSlugProviderOutcome =>
        stopped || signal.aborted
          ? { source, status: "aborted" }
          : { source, status: "failed" },
    );

  const interrupted = new Promise<LiveSlugProviderOutcome>((resolve) => {
    timer = setTimeout(() => {
      stopped = true;
      resolve({ source, status: "timeout" });
    }, timeoutMs);
    const onAbort = () => {
      stopped = true;
      resolve({ source, status: "aborted" });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbort = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([guarded, interrupted]).finally(() => {
    if (timer) clearTimeout(timer);
    removeAbort?.();
  });
}

async function finishLiveSlugCandidate(
  candidate: LiveSlugCandidate,
  source: string,
  options: { signal?: AbortSignal; deadline?: number },
): Promise<EventWithMeta> {
  const event = candidate.needsGeomUpgrade
    ? await upgradeEventGeom(candidate.event)
    : candidate.event;
  if (
    options.signal?.aborted ||
    (options.deadline != null && Date.now() >= options.deadline)
  ) {
    throw new LiveEventLookupIncompleteError([source]);
  }
  return withVenueThumb(event);
}

/**
 * Adapt one live feed event to the EventWithMeta shape the card and
 * detail page consume. The slug is the deterministic liveEventSlug (not
 * the raw feed UID) so the same value the card links to and Share copies
 * can be resolved back by getLiveCardEventBySlug. source is "manual"
 * (matching the prior behaviour) but note that is NOT a reliable
 * live-vs-seed signal: many hand-authored seed events also use "manual".
 * The reliable signal is "did getEventBySlug resolve it" — the detail
 * route relies on that ordering, not on source.
 */
export function liveToCardEvent(e: LiveEvent): EventWithMeta {
  // Normalize feed strings at this boundary, never in the card. Title
  // gets entity-decoded, presenter-split, and hyphen/year-cleaned;
  // venue and address get decoded; the address also gets its
  // suffix-into-city concatenation repaired.
  const { presenter, title } = normalizeTitle(e.title, { year: etYear(e.starts_at) });
  const attendance_mode = eventAttendanceMode({
    ...e,
    title,
  });
  const online_url =
    e.online_url ??
    (attendance_mode !== "physical" && isLikelyEventActionUrl(e.url)
      ? e.url
      : undefined);
  const venueName =
    attendance_mode === "online" ? "Online" : cleanFeedText(e.venue_name ?? "");
  const address =
    attendance_mode === "online" ? "" : formatAddress(cleanFeedText(e.address ?? ""));
  return {
    // Clean, shareable slug (Phase 2). The legacy liveEventSlug is kept
    // only as a fallback resolver for old shared links.
    slug: liveCleanSlug(e),
    title,
    presenter,
    description: cleanFeedText(e.description ?? ""),
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: "America/New_York",
    is_all_day: e.is_all_day ?? false,
    is_recurring: false,
    venue_name: venueName,
    address,
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    // Publisher words → shared audience vocabulary; empty stays honest
    // uncertainty (see lib/events/audienceSignals).
    audience: audienceFromText(title, e.description),
    is_free: e.is_free,
    price_text: e.price_text,
    attendance_mode,
    online_url,
    hero_image: e.hero_image,
    organizer: e.organizer,
    status: e.status,
    // The feed's real source, not "manual": the hardcode let every live
    // row (Ticketmaster, county, venue feeds) claim first party curated
    // trust. eventTrust still labels county rows Official and the rest
    // Live; readiness only leaned on the curated label for rows with no
    // source URL, which live rows carry.
    source: e.source,
    is_verified: false,
    // source_url and last_verified_at come from the stamp below, which
    // normalizes a missing URL to null and a missing date to the
    // documented backfill epoch.
    ...stampEventProvenance(
      {
        slug: liveCleanSlug(e),
        source: e.source,
        source_id: e.id,
        source_url: e.url,
        last_verified_at: e.last_verified_at,
      },
    ),
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    distance_m: undefined,
    // Most live feeds carry no per-event geocode — every row sits on its
    // feed's default centroid, so this resolves to "area" and never claims a
    // distance. A feed that DOES resolve a distinct per-event coordinate marks
    // it with placement:"geocoded" (e.g. Visit Frederick detail-page JSON-LD),
    // which lifts it to "exact_address" and a real distance. Absent placement,
    // behaviour is exactly as before. See lib/events/geo-confidence.
    geo_confidence:
      attendance_mode === "online"
        ? "unknown"
        : eventGeoConfidence({ placement: e.placement, geom: e.geom }),
  };
}

/**
 * Resolve a single live event by slug, for the detail route. Tries the
 * clean stored slug first, then the legacy "live-..." slug as a
 * fallback. Returns null when nothing matches or the event has left the
 * feed window. The detail route resolves seed events first, so this only
 * runs when the seed lookup missed; a clean live slug looks like a seed
 * slug, so the old "starts-with-live-" fast path is gone and any
 * unmatched slug now consults the (cached) feed.
 *
 * Window is 90 days: a superset of the index's 60-day card window so a
 * link shared the moment a card appears still resolves. The underlying
 * feed fetch is HTTP-cached (next.revalidate 3600) and the request URL
 * is identical regardless of windowDays, so this shares the index's
 * cache entry rather than adding a round trip.
 */
export async function getLiveCardEventBySlug(
  slug: string,
  windowDays = 90,
  options: {
    signal?: AbortSignal;
    deadline?: number;
    allowNetwork?: boolean;
  } = {},
): Promise<EventWithMeta | null> {
  if (
    options.signal?.aborted ||
    (options.deadline != null && Date.now() >= options.deadline)
  ) {
    throw new LiveEventLookupIncompleteError(["live"]);
  }

  // The committed venue snapshot is deterministic and already powers event
  // cards. Resolve it before starting any provider work so its deep links stay
  // instant even during a total upstream outage.
  const committedVenueHit = venueEventsAsCards(new Date()).find(
    (event) => event.slug === slug,
  );
  if (committedVenueHit) return withVenueThumb(committedVenueHit);

  // Event detail is allowed to use committed venue snapshots, but a visitor
  // request must never become the owner of the countywide provider fanout.
  // The background warmer and archive jobs own that work. A dated event
  // that has not reached durable storage yet is an honest recovery state,
  // not permission to leave provider promises alive after the page deadline.
  const promotedBuild = isPromotedDataBuild();
  if (options.allowNetwork === false || promotedBuild) {
    throw new LiveEventLookupIncompleteError([
      promotedBuild ? "promoted-snapshot-only" : "live-network-disabled",
    ]);
  }

  const sourceBudget = Math.min(
    SLUG_SOURCE_TIMEOUT_MS,
    options.deadline == null
      ? SLUG_SOURCE_TIMEOUT_MS
      : Math.max(0, options.deadline - Date.now()),
  );
  if (sourceBudget <= 0) {
    throw new LiveEventLookupIncompleteError(["live"]);
  }

  // The SAME source union the /events index renders (iCal feeds +
  // Ticketmaster music/sports + Bandsintown). The resolver used to consult
  // only the iCal feeds, so every Ticketmaster/Bandsintown card on the
  // listing — the Weinberg cinema series, ABBAFAB, TED Democracy Live —
  // linked to a slug this function could never resolve: a guaranteed
  // "Event not found" on a primary surface (June-9 deep audit P0-1,
  // 6 of 45 listing links dead). Provider fetches are HTTP-cached upstream,
  // so this shares the index's cache entries.
  // Each source is independently bounded and settled. The old Promise.all
  // shape waited for the slowest source before inspecting a fast hit, which
  // made a valid event miss the page resolver's 2.5-second deadline. Racing
  // outcomes lets the first exact slug match win while still waiting for every
  // provider before declaring a definitive miss.
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  // Close the tiny race between the entry check above and listener setup.
  if (options.signal?.aborted) controller.abort();

  const liveCandidate = (
    events: readonly LiveEvent[],
  ): LiveSlugCandidate | null => {
    const event = matchingLiveEvent(events, slug);
    return event
      ? { event: liveToCardEvent(event), needsGeomUpgrade: true }
      : null;
  };
  const venueCandidate = (
    events: VenueEvent[],
  ): LiveSlugCandidate | null => {
    const event = venueEventsToCards(events).find(
      (candidate) => candidate.slug === slug,
    );
    return event ? { event, needsGeomUpgrade: false } : null;
  };

  const providerPromises: Array<Promise<LiveSlugProviderOutcome>> = [
    resolveLiveSlugProvider({
      source: "ical",
      load: () =>
        getCachedLiveEvents(windowDays).then((result) => result.events),
      match: liveCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
    // Ticketmaster music already arrives inside getCachedLiveEvents. Keep only
    // the separate sports query here so a cold detail lookup does not issue the
    // same Discovery request twice.
    resolveLiveSlugProvider({
      source: "ticketmaster-sports",
      load: fetchTicketmasterSports,
      match: liveCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
    resolveLiveSlugProvider({
      source: "bandsintown",
      load: () => fetchBandsintownForArtists(BANDSINTOWN_ARTISTS),
      match: liveCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
    resolveLiveSlugProvider({
      source: "visit-frederick",
      load: fetchVisitFrederick,
      match: liveCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
    resolveLiveSlugProvider({
      source: "frederick-keys",
      load: () => fetchFrederickKeys(),
      match: liveCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
    resolveLiveSlugProvider({
      source: "squarespace",
      load: () => fetchSquarespaceVenueEvents(windowDays),
      match: venueCandidate,
      timeoutMs: sourceBudget,
      signal: controller.signal,
    }),
  ];

  const pending = new Map(
    providerPromises.map((promise, index) => [index, promise]),
  );
  const incompleteSources: string[] = [];

  try {
    while (pending.size > 0) {
      const settled = await Promise.race(
        [...pending.entries()].map(([index, promise]) =>
          promise.then((outcome) => ({ index, outcome })),
        ),
      );
      pending.delete(settled.index);

      if (settled.outcome.status === "hit") {
        controller.abort();
        return await finishLiveSlugCandidate(
          settled.outcome.candidate,
          settled.outcome.source,
          options,
        );
      }
      if (settled.outcome.status !== "miss") {
        incompleteSources.push(settled.outcome.source);
      }
    }
  } finally {
    controller.abort();
    options.signal?.removeEventListener("abort", abortFromParent);
  }

  if (incompleteSources.length > 0) {
    throw new LiveEventLookupIncompleteError(incompleteSources);
  }
  return null;
}
