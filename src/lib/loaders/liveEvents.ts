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
import { getCachedLiveEvents, liveEventSlug, type LiveEvent } from "@/lib/integrations/ical-live";
import {
  fetchTicketmasterMusic,
  fetchTicketmasterSports,
} from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { BANDSINTOWN_ARTISTS } from "@/data/bandsintown-artists";
import { fetchVisitFrederick } from "@/lib/integrations/visitfrederick";
import { fetchFrederickKeys } from "@/lib/integrations/frederickKeys";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import { venueEventsAsCards, venueEventsToCards } from "@/lib/loaders/venueEvents";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
import { upgradeEventGeom } from "@/lib/integrations/mapboxGeocode";
import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { cleanFeedText, formatAddress } from "@/lib/format/text";
import { normalizeTitle, etYear, cleanEventSlug } from "@/lib/events/normalize";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";

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

/**
 * Bound a single source fetch so the /events/[slug] resolver can't hang
 * the page on a cold cache or a slow upstream. On timeout it resolves to
 * `fallback` (it never rejects), mirroring the guard the /map page uses.
 * The warm-events cron keeps these caches hot, so this only bites the
 * rare cold-window request (e.g. the first hit right after a deploy busts
 * the SHA-keyed cache); without it, that request awaited the slowest feed
 * up to the full 8s per-feed timeout. The per-source `.catch` below still
 * handles genuine rejections.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Worst-case wall time the slug resolver may spend awaiting any one
 *  source before it degrades that source to empty. All sources run in
 *  parallel, so this also bounds the whole resolution. */
const SLUG_SOURCE_TIMEOUT_MS = 6_000;

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
    venue_name: cleanFeedText(e.venue_name ?? ""),
    address: formatAddress(cleanFeedText(e.address ?? "")),
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    audience: [],
    is_free: e.is_free,
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
      { slug: liveCleanSlug(e), source: e.source, source_url: e.url, last_verified_at: e.last_verified_at },
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
    geo_confidence: eventGeoConfidence({ placement: e.placement, geom: e.geom }),
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
): Promise<EventWithMeta | null> {
  // The SAME source union the /events index renders (iCal feeds +
  // Ticketmaster music/sports + Bandsintown). The resolver used to consult
  // only the iCal feeds, so every Ticketmaster/Bandsintown card on the
  // listing — the Weinberg cinema series, ABBAFAB, TED Democracy Live —
  // linked to a slug this function could never resolve: a guaranteed
  // "Event not found" on a primary surface (June-9 deep audit P0-1,
  // 6 of 45 listing links dead). Same fail-soft pattern as the index:
  // a hung provider degrades to [], never throws. All four fetches are
  // HTTP-cached upstream, so this shares the index's cache entries.
  // Each source is BOTH timeout-bounded (withTimeout → fallback, the cold-
  // cache / slow-upstream guard) AND catch-guarded (→ fallback, genuine
  // rejection). Without the timeout, a cold-window hit awaited the slowest
  // feed up to the 8s per-feed ceiling on a primary surface; the per-source
  // bound keeps the whole parallel resolution under ~6s.
  const [ical, tmMusic, tmSports, bit, vf, keys, sqRaw] = await Promise.all([
    withTimeout(getCachedLiveEvents(windowDays).then((r) => r.events), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchTicketmasterMusic(), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchTicketmasterSports(), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchBandsintownForArtists(BANDSINTOWN_ARTISTS), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchVisitFrederick(), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchFrederickKeys(), SLUG_SOURCE_TIMEOUT_MS, [] as LiveEvent[]).catch(() => [] as LiveEvent[]),
    withTimeout(fetchSquarespaceVenueEvents(windowDays), SLUG_SOURCE_TIMEOUT_MS, []).catch(() => []),
  ]);
  const events = [...ical, ...tmMusic, ...tmSports, ...bit, ...vf, ...keys];
  // Clean stored slug first (the canonical form a card links to).
  let hit = events.find((e) => liveCleanSlug(e) === slug);
  // Legacy fallback: an old "live-..." shared link still resolves so it
  // never 404s. The detail route notices the slug mismatch and redirects
  // the visitor to the clean URL.
  if (!hit && slug.startsWith("live-")) {
    hit = events.find((e) => liveEventSlug(e) === slug);
  }
  // Centroid-geom upgrade FIRST (same pass the unified assembly runs, so the
  // detail page's pin/mini-map agrees with the list card's — normally a 30-day
  // geocode-cache hit, fail-soft), then the venue-thumb borrow (same trust
  // gates as the list assembly): without it the DETAIL page rendered the
  // gradient fallback for an event whose list card carried a real venue photo
  // (image audit 2026-07-07). The thumb join runs AFTER the upgrade so its
  // precise-geo containment gate sees the repaired coordinate.
  if (hit) return withVenueThumb(await upgradeEventGeom(liveToCardEvent(hit)));
  // FIFTH + SIXTH sources: extracted venue lineups — the committed
  // venue-events.json snapshot (the Weinberg's cinema/talk slate) AND the
  // runtime Squarespace `?format=json` lineups (The Banyan). The listing
  // folds BOTH into the same unified set, so their slugs are first-class
  // links and must resolve here too. Both are already EventWithMeta cards
  // with their slug stamped — match directly.
  const venueHit = [
    ...venueEventsAsCards(new Date()),
    ...venueEventsToCards(sqRaw),
  ].find((c) => c.slug === slug);
  return venueHit ? withVenueThumb(venueHit) : null;
}
