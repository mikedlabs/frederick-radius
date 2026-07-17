import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { unstable_cache } from "next/cache";
import { BREWERIES } from "@/data/beers";
import { BREWERY_BY_SLUG } from "@/data/beers";
import { BreweryLogo } from "./BreweryLogo";
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

const POSTER_TONES = ["#762f20", "#2e2a23", "#82551c", "#3c2927", "#6a3b23", "#25231f", "#754225"] as const;

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
    if (count >= 2) continue;
    breweryCounts.set(candidate.brewerySlug, count + 1);
    events.push(candidate);
    if (events.length === 7) break;
  }

  return (
    <section id="beer-week" aria-labelledby="beer-week-heading" className="scroll-mt-24">
      <header className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-brand-press)" }}>The taproom calendar</p>
          <h2 id="beer-week-heading" className="mt-2 max-w-[9ch] font-serif text-[clamp(2.8rem,9vw,5rem)] font-semibold leading-[0.86] tracking-[-0.05em]" style={{ color: "var(--app-ink)" }}>
            Beer has plans.
          </h2>
          <p className="mt-4 max-w-[38rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>Live music, releases, and taproom nights pulled from brewery and local calendars.</p>
        </div>
        <Link href="/events?cats=brewery" className="inline-flex min-h-11 items-center gap-1.5 border-b text-[11px] font-semibold" style={{ borderColor: "var(--app-brand)", color: "var(--app-ink-2)" }}>
          Full events board <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      {events.length > 0 ? (
        <ol className="-mx-4 mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {events.map(({ event, brewerySlug }, index) => {
            const isToday = easternDayKey(new Date(event.starts_at)) === easternDayKey(now);
            const starts = new Date(event.starts_at);
            const brewery = BREWERY_BY_SLUG[brewerySlug];
            return (
              <li key={event.slug} className="w-[78vw] max-w-[290px] shrink-0 snap-center sm:w-auto sm:max-w-none">
                <Link href={`/events/${event.slug}`} className="beer-event-poster group relative flex min-h-[285px] flex-col overflow-hidden border border-white/10 p-4 text-[#fff8eb] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]" style={{ background: `linear-gradient(145deg, ${POSTER_TONES[index % POSTER_TONES.length]}, #18130f 118%)` }}>
                  <span className="absolute -right-4 -top-8 font-serif text-[130px] leading-none text-white/[0.055]" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                  <span className="relative flex items-start justify-between gap-3">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/52">{isToday ? "Tonight" : EVENT_DAY.format(starts)}</span>
                    {brewery ? <BreweryLogo brewerySlug={brewery.slug} breweryName={brewery.name} decorative sizes="42px" className="h-[42px] w-[42px] bg-[#f8f4eb] object-contain p-1 shadow-[0_8px_18px_rgba(0,0,0,.3)]" /> : null}
                  </span>
                  <span className="relative mt-auto">
                    <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#f3d496]">{EVENT_TIME.format(starts)}</span>
                    <span className="mt-2 block font-serif text-[28px] font-semibold leading-[0.92] tracking-[-0.03em]">{event.title}</span>
                    <span className="mt-3 block text-[11px] leading-relaxed text-white/58">{event.venue_name || event.municipality_name}</span>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/75">Open event <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-7 flex items-center gap-2 border-y py-6 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
          <CalendarDays className="h-4 w-4" aria-hidden /> No source-backed taproom events are on the board for the next seven days.
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
      <div className="mt-6 flex gap-3 overflow-hidden">
        {[0, 1, 2].map((row) => <div key={row} className="h-[285px] w-[78vw] max-w-[290px] shrink-0 animate-pulse bg-black/10" />)}
      </div>
    </section>
  );
}
