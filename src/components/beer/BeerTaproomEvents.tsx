import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { unstable_cache } from "next/cache";
import { BREWERIES } from "@/data/beers";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { venueEventsAsCards, venueEventsToCards } from "@/lib/loaders/venueEvents";
import { getCachedLiveEventsForSources } from "@/lib/integrations/ical-live";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventSheetBoundary from "@/components/event/EventSheetBoundary";
import { easternDayKey } from "@/lib/tz";

/**
 * The taproom radar — the live layer that makes /beer a tonight
 * decision, not an archive (brewer-pilot groundwork: the page has to
 * be visibly alive before taprooms are asked to post to it).
 *
 * Two tiers:
 *   TONIGHT — every brewery with something on today, uncapped: trivia,
 *     live music, food trucks, releases. This is the question a beer
 *     drinker actually brings ("where's the good taproom night?").
 *   THIS WEEK — the forward glance, one event per brewery, capped, so
 *     the section stays a radar rather than a second events board.
 *
 * Coverage: THE unified assembly (curated + iCal + Ticketmaster +
 * Bandsintown + venue lineups) merged with the beer-specific direct
 * feeds, deduped by slug — a brewery trivia night ingested from any
 * source lands here. Taps open the event sheet in place (the shared
 * sheet system's lean-surface mode); real anchors stay for SEO and
 * modified clicks.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

const getCachedBeerVenueEvents = unstable_cache(
  async () => venueEventsToCards(await fetchSquarespaceVenueEvents(7)),
  ["beer-squarespace-events-v1"],
  { revalidate: 300, tags: ["events"] },
);

const EVENT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const EVENT_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function breweryAliases(name: string): string[] {
  const normalized = normalize(name);
  const short = normalized
    .replace(/brewingcompany|brewingco|brewery|brewhouse|station|restaurant|riverside/g, "")
    .replace(/atstillpointfarm|andhopyard/g, "");
  return [normalized, short].filter((alias) => alias.length >= 6);
}

const BREWERY_SLUGS = new Set(BREWERIES.map((brewery) => brewery.slug));
const BREWERY_NAME_BY_SLUG = new Map(BREWERIES.map((brewery) => [brewery.slug, brewery.name]));
const BREWERY_ALIAS_ROWS = BREWERIES.map((brewery) => ({
  slug: brewery.slug,
  aliases: breweryAliases(brewery.name),
}));

function breweryNamedBy(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  return BREWERY_ALIAS_ROWS.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(alias)),
  )?.slug ?? null;
}

function matchBrewery(event: EventWithMeta): string | null {
  if (event.venue_place_slug && BREWERY_SLUGS.has(event.venue_place_slug)) {
    return event.venue_place_slug;
  }
  return (
    breweryNamedBy(event.venue_name ?? "")
      ?? ((event.category === "brewery" || event.category === "music")
        ? breweryNamedBy(event.title)
        : null)
  );
}

type Matched = { event: EventWithMeta; brewerySlug: string };

export default async function BeerTaproomEvents() {
  const now = new Date();
  const limit = new Date(now.getTime() + WEEK_MS);
  const [monocacy, venueLive, unified] = await Promise.all([
    getCachedLiveEventsForSources(["monocacy"], 7),
    getCachedBeerVenueEvents(),
    assembleUnifiedEvents(now).catch(() => ({ publicEvents: [] as EventWithMeta[] })),
  ]);
  const eventBySlug = new Map(
    [
      ...unified.publicEvents,
      ...monocacy.events.map(liveToCardEvent),
      ...venueEventsAsCards(now),
      ...venueLive,
    ].map((event) => [event.slug, event]),
  );

  const todayKey = easternDayKey(now);
  const tonight: Matched[] = [];
  const upcoming: Matched[] = [];
  for (const event of eventBySlug.values()) {
    const brewerySlug = matchBrewery(event);
    if (!brewerySlug) continue;
    const starts = new Date(event.starts_at);
    if (Number.isNaN(starts.getTime()) || starts > limit) continue;
    const isToday = easternDayKey(starts) === todayKey;
    const ends = event.ends_at ? new Date(event.ends_at) : null;
    const stillOn = ends ? ends > now : starts.getTime() > now.getTime() - 60 * 60 * 1_000;
    if (isToday && stillOn) {
      tonight.push({ event, brewerySlug });
    } else if (starts > now && !isToday) {
      upcoming.push({ event, brewerySlug });
    }
  }
  tonight.sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at));
  upcoming.sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at));

  // The week list stays a radar: one event per brewery, four rows max,
  // never repeating a brewery already covered tonight.
  const tonightBreweries = new Set(tonight.map((row) => row.brewerySlug));
  const weekRows: Matched[] = [];
  const seen = new Set<string>();
  for (const row of upcoming) {
    if (tonightBreweries.has(row.brewerySlug) || seen.has(row.brewerySlug)) continue;
    seen.add(row.brewerySlug);
    weekRows.push(row);
    if (weekRows.length === 4) break;
  }

  const heading = tonight.length > 0 ? "Tonight at the taprooms." : "Taproom events this week.";

  return (
    <EventSheetBoundary fetchMissing>
      <section id="beer-week" aria-labelledby="beer-week-heading" className="scroll-mt-24">
        <header className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>
              {tonight.length > 0 ? "On tonight" : "Coming up"}
            </p>
            <h2 id="beer-week-heading" className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]" style={{ color: "var(--app-ink)" }}>
              {heading}
            </h2>
            <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Radius builds this list from brewery and local event calendars. Tap a night for the details.
            </p>
          </div>
          <Link href="/events?cats=brewery" className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
            All beer events <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </header>

        {tonight.length > 0 && (
          <ol className="reveal-up mt-5 divide-y divide-black/10 border-y border-black/12">
            {tonight.map(({ event, brewerySlug }) => {
              const starts = new Date(event.starts_at);
              const started = starts <= now;
              return (
                <li key={event.slug}>
                  <Link href={`/events/${event.slug}`} className="group grid min-h-[82px] grid-cols-[68px_minmax(0,1fr)_28px] items-center gap-3 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 sm:grid-cols-[92px_minmax(0,1fr)_32px]">
                    <span>
                      <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand-press)" }}>
                        {started ? "On now" : "Tonight"}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-black/65">{EVENT_TIME.format(starts)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-snug text-[#281e14] sm:text-[14px]">{event.title}</span>
                      <span className="mt-1 block truncate text-[10px] text-black/65">
                        {BREWERY_NAME_BY_SLUG.get(brewerySlug) ?? event.venue_name}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-black/38 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {weekRows.length > 0 ? (
          <ol className={`reveal-up ${tonight.length > 0 ? "mt-3 border-b" : "mt-5 border-y"} divide-y divide-black/10 border-black/12`}>
            {weekRows.map(({ event, brewerySlug }) => {
              const starts = new Date(event.starts_at);
              return (
                <li key={event.slug}>
                  <Link href={`/events/${event.slug}`} className="group grid min-h-[82px] grid-cols-[68px_minmax(0,1fr)_28px] items-center gap-3 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 sm:grid-cols-[92px_minmax(0,1fr)_32px]">
                    <span>
                      <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#85501f]">{EVENT_DAY.format(starts)}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-black/65">{EVENT_TIME.format(starts)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-snug text-[#281e14] sm:text-[14px]">{event.title}</span>
                      <span className="mt-1 block truncate text-[10px] text-black/65">
                        {BREWERY_NAME_BY_SLUG.get(brewerySlug) ?? event.venue_name}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-black/38 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : tonight.length === 0 ? (
          <p className="mt-5 flex items-center gap-2 border-y py-6 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
            <CalendarDays className="h-4 w-4" aria-hidden /> No source-backed taproom events are listed for the next seven days.
          </p>
        ) : null}

        {monocacy.sources_failed.length > 0 ? (
          <p className="mt-3 text-[9px]" style={{ color: "var(--app-ink-3)" }}>
            Some event sources are temporarily unavailable, so this may be a partial list.
          </p>
        ) : null}
      </section>
    </EventSheetBoundary>
  );
}

export function BeerTaproomEventsFallback() {
  return (
    <section aria-label="Loading taproom events" className="py-6">
      <div className="h-2.5 w-44 animate-pulse rounded bg-black/10" />
      <div className="mt-3 h-12 w-72 max-w-full animate-pulse rounded bg-black/10" />
      <div className="mt-5 divide-y divide-black/10 border-y border-black/10">
        {[0, 1].map((row) => <div key={row} className="h-[82px] animate-pulse bg-black/[0.04]" />)}
      </div>
    </section>
  );
}
