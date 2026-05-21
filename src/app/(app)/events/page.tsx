import type { Metadata } from "next";
import { ExternalLink, GraduationCap, CalendarDays } from "lucide-react";
import { allUpcoming, eventsLive, dedupeLiveAgainstCurated, type EventWithMeta } from "@/lib/loaders/events";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import EventCard from "@/components/event/EventCard";
import WeekStrip from "@/components/event/WeekStrip";
import TonightRail from "@/components/event/TonightRail";
import CategoryJumpTiles from "@/components/event/CategoryJumpTiles";
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
import PageBloom from "@/components/ui/PageBloom";

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
  // ?d=YYYY-MM-DD deep-links to a specific Eastern day. Format is
  // validated by the regex so a garbled link can't crash the explorer.
  const dParam = sp.get("d");
  const initialDay = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) ? dParam : undefined;

  // Quiet byline numbers for /events — identity at a glance, not a
  // four-cell stat block. Live-feed count + town count is enough to
  // earn the "the whole county is here" claim without taking up a
  // whole module above the date rail.
  const liveCount = liveCards.length;

  // Hero feature — the next photo-backed upcoming event. Photo-led
  // entries (Alive @ Five, Sky Stage, the curated season) carry the
  // banner; text-only county-feed rows stay out of the hero so the
  // top of the page always has imagery to land on.
  const heroEvent = allEvents.find((e) => Boolean(e.hero_image)) ?? null;

  // "Tonight" rail — events starting in the next 6 hours (the next-24
  // window if it's already past 8pm so the rail isn't empty at night).
  // Photo-led, ordered by start time. Different from the explorer's
  // "Tonight" lens because this is the *editorial marquee*, capped at 8.
  const tonightEnd = new Date(now);
  tonightEnd.setHours(tonightEnd.getHours() + 6);
  const tonightEvents = allEvents.filter((e) => {
    const t = +new Date(e.starts_at);
    return t >= +now && t <= +tonightEnd;
  });
  // If "next 6 hours" is too thin (late night, post-evening lull), widen
  // to "next 24 hours" so the rail still has signal to show.
  const tonightFinal =
    tonightEvents.length >= 3
      ? tonightEvents
      : allEvents.filter((e) => {
          const t = +new Date(e.starts_at);
          return t >= +now && t <= +start24;
        }).slice(0, 8);

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      {/* Editorial event hero — full-bleed magazine card for the next
          photo-backed event. Above the title so visitors meet imagery
          before they meet a list. */}
      {heroEvent && (
        <section aria-label="Featured event">
          <EventCard event={heroEvent} variant="feature" />
        </section>
      )}

      {/* Magazine masthead — one compact row. Eyebrow + serif title;
          the month view link is a quiet inline pill, not a loud
          full-width CTA. Byline carries the breadth claim ("112 events
          across 7 towns") in one sentence so the StatStrip cell grid
          can retire. */}
      <header className="space-y-1.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
              Live across the county
            </p>
            <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
              Events
            </h1>
          </div>
          <a
            href="/events/calendar"
            className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Month view
          </a>
        </div>
        <p
          className="text-[12px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
            {allEvents.length}
          </span>{" "}
          events across{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
            {towns.length}
          </span>{" "}
          towns this season
          {liveCount > 0 && (
            <>
              {" · "}
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: "var(--app-positive)" }}
              >
                <span className="live-dot" /> {liveCount} live
              </span>
            </>
          )}
        </p>
      </header>

      {/* The new date rail — 14 days, activity-bar density, no tile
          borders. Replaces the boxy WeekStrip-as-tile-grid. */}
      <WeekStrip events={allEvents} activeDay={initialDay} />

      {/* "Tonight at a glance" — editorial marquee of what's starting
          in the next ~6 hours (or 24h if the evening's thin). Photo-led
          horizontal rail; this is what people actually open /events to
          ask. */}
      {tonightFinal.length > 0 && (
        <TonightRail events={tonightFinal} />
      )}

      {/* Visual entry points to the deeper category surfaces. */}
      <CategoryJumpTiles events={allEvents} />

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
        initialDay={initialDay}
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
