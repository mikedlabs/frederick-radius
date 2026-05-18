import type { Metadata } from "next";
import { ExternalLink, GraduationCap, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { allUpcoming, eventsLive, dedupeLiveAgainstCurated, type EventWithMeta } from "@/lib/loaders/events";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import { getHoodEvents } from "@/lib/integrations/hood";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatEventTime, eventDateParts } from "@/lib/format/eventTime";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";

export const metadata: Metadata = {
  title: "Events",
  description: "Live event feeds from Downtown Frederick Partnership, Celebrate Frederick, the County, and Hood College.",
};

export const revalidate = 3600;

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const seedLive = eventsLive(now);
  const curatedUpcoming = allUpcoming(now);

  const [{ events: liveEventsRaw }, hood, ingestedSeries, ingestedSummary, tmEvents, bitEvents] =
    await Promise.all([
      getLiveEvents(60),
      getHoodEvents(),
      getIngestedSeries(),
      getIngestedSummary(),
      // Real live-music shows. Inert (returns []) until the owner sets
      // TICKETMASTER_API_KEY / BANDSINTOWN_APP_ID — never fabricated.
      fetchTicketmasterMusic().catch(() => []),
      // Bandsintown public API is artist-scoped only (see the module):
      // no curated local-artist list yet, so this is inert by design.
      fetchBandsintownForArtists([]).catch(() => []),
    ]);

  // Live/county events + real live-music feeds, with curated-duplicates
  // dropped (P0-4).
  const liveCards = dedupeLiveAgainstCurated(
    [...liveEventsRaw, ...tmEvents, ...bitEvents].map(liveToCardEvent),
    curatedUpcoming,
  );

  // One unified, de-duplicated, time-sorted set the explorer drives.
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  const allEvents = withVenueThumbs(
    [...bySlug.values()].sort(
      (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
    ),
  );
  const liveSlugs = seedLive.map((e) => e.slug);

  // Facet lists, only for values actually present.
  const catSlugs = [...new Set(allEvents.map((e) => e.category).filter(Boolean))];
  const categories = catSlugs
    .map((s) => ({ slug: s, name: CATEGORY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const townSlugs = [...new Set(allEvents.map((e) => e.municipality).filter(Boolean))];
  const towns = townSlugs
    .map((s) => ({ slug: s, name: MUNICIPALITY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Server-computed window boundaries (no client TZ math).
  const start24 = new Date(now);
  start24.setHours(now.getHours() + 24);
  const dow = now.getDay();
  const friday = new Date(now);
  friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
  friday.setHours(17, 0, 0, 0);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  monday.setHours(0, 0, 0, 0);

  // Parse the deep-link view server-side so the explorer's first paint
  // already reflects it (no post-mount setState, no hydration mismatch).
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") sp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") sp.set(k, v[0]);
  }
  const initialView: ViewState = parseViewState(sp);

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Live across the county
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            Events
          </h1>
          <p className="mt-0.5 text-[13px] text-pretty" style={{ color: "var(--app-ink-3)" }}>
            What&apos;s on across Frederick County — now through the season.
          </p>
        </div>
        <Button
          href="/events/calendar"
          size="sm"
          className="shrink-0 rounded-full"
          iconLeft={<CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />}
        >
          Calendar
        </Button>
      </header>

      <EventsExplorer
        events={allEvents}
        liveSlugs={liveSlugs}
        categories={categories}
        towns={towns}
        nowISO={now.toISOString()}
        next24ISO={start24.toISOString()}
        weekendStartISO={friday.toISOString()}
        weekendEndISO={monday.toISOString()}
        initialView={initialView}
      />

      {ingestedSeries.length > 0 && (
        <MunicipalEvents series={ingestedSeries} summary={ingestedSummary} />
      )}

      {hood.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="inline-flex items-center gap-2 font-serif text-xl font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              <GraduationCap className="h-4 w-4" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
              Hood College
            </h2>
            <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{hood.length} upcoming</span>
          </div>
          <ul className="stagger space-y-2">
            {hood.map((e) => (
              <li key={e.id}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tactile tactile-interactive flex items-start gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-3"
                >
                  <div
                    aria-hidden
                    className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-cool)" }}>
                      {eventDateParts(e.starts_at).monthShortUpper}
                    </span>
                    <span className="font-serif text-xl font-semibold leading-none" style={{ color: "var(--app-ink)" }}>
                      {eventDateParts(e.starts_at).day}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
                      {e.title}
                    </h3>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--app-ink-3)" }}>
                      {formatEventTime(e.starts_at)} · {e.location}
                    </p>
                  </div>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        <p>
          Live event data pulled from Downtown Frederick Partnership, Celebrate Frederick,
          the Frederick County calendar, and the Hood College Trumba feed. Cached for one hour.
        </p>
        <p>
          Missing an event? <a href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>Submit it →</a>
        </p>
      </footer>
    </div>
  );
}
