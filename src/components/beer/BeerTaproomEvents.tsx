import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { unstable_cache } from "next/cache";
import { BREWERIES } from "@/data/beers";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { venueEventsAsCards, venueEventsToCards } from "@/lib/loaders/venueEvents";
import { getCachedLiveEventsForSources } from "@/lib/integrations/ical-live";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import { easternDayKey } from "@/lib/tz";

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

/** A live, source-backed brewery calendar slice. It intentionally shows only
 * the next week; the full county event board remains the long view. */
export default async function BeerTaproomEvents() {
  const now = new Date();
  const limit = new Date(now.getTime() + WEEK_MS);
  const [monocacy, venueLive] = await Promise.all([
    getCachedLiveEventsForSources(["monocacy"], 7),
    getCachedBeerVenueEvents(),
  ]);
  const eventBySlug = new Map(
    [
      ...monocacy.events.map(liveToCardEvent),
      ...venueEventsAsCards(now),
      ...venueLive,
    ].map((event) => [event.slug, event]),
  );
  const publicEvents = [...eventBySlug.values()];
  const candidates = publicEvents
    .flatMap((event) => {
      const starts = new Date(event.starts_at);
      if (starts < now || starts > limit) return [];
      const matchedSlug = event.venue_place_slug && BREWERY_SLUGS.has(event.venue_place_slug)
        ? event.venue_place_slug
        : breweryNamedBy(event.venue_name)
          ?? ((event.category === "brewery" || event.category === "music")
            ? breweryNamedBy(event.title)
            : null);
      return matchedSlug ? [{ event, brewerySlug: matchedSlug }] : [];
    })
    .sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at));
  const breweryCounts = new Map<string, number>();
  const events = [] as typeof candidates;
  for (const candidate of candidates) {
    const count = breweryCounts.get(candidate.brewerySlug) ?? 0;
    if (count >= 1) continue;
    breweryCounts.set(candidate.brewerySlug, count + 1);
    events.push(candidate);
    if (events.length === 4) break;
  }

  return (
    <section id="beer-week" aria-labelledby="beer-week-heading" className="scroll-mt-24">
      <header className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-press)" }}>Coming up</p>
          <h2 id="beer-week-heading" className="mt-1 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]" style={{ color: "var(--app-ink)" }}>
            Taproom events this week.
          </h2>
          <p className="mt-2 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Radius builds this list from brewery and local event calendars.</p>
        </div>
        <Link href="/events?cats=brewery" className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
          All beer events <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      {events.length > 0 ? (
        <ol className="mt-5 divide-y divide-black/10 border-y border-black/12">
          {events.map(({ event }) => {
            const isToday = easternDayKey(new Date(event.starts_at)) === easternDayKey(now);
            const starts = new Date(event.starts_at);
            return (
              <li key={event.slug}>
                <Link href={`/events/${event.slug}`} className="group grid min-h-[82px] grid-cols-[68px_minmax(0,1fr)_28px] items-center gap-3 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] focus-visible:ring-offset-2 sm:grid-cols-[92px_minmax(0,1fr)_32px]">
                  <span>
                    <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#85501f]">{isToday ? "Tonight" : EVENT_DAY.format(starts)}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-black/64">{EVENT_TIME.format(starts)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-snug text-[#281e14] sm:text-[14px]">{event.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-black/50">{event.venue_name || event.municipality_name}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-black/38 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-5 flex items-center gap-2 border-y py-6 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
          <CalendarDays className="h-4 w-4" aria-hidden /> No source-backed taproom events are listed for the next seven days.
        </p>
      )}

      {monocacy.sources_failed.length > 0 ? (
        <p className="mt-3 text-[9px]" style={{ color: "var(--app-ink-3)" }}>
          Some event sources are temporarily unavailable, so this may be a partial list.
        </p>
      ) : null}
    </section>
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
