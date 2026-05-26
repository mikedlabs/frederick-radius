import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Calendar, Sparkles, MapPin } from "lucide-react";
import { allUpcoming, eventsLive, dedupeLiveAgainstCurated, isCivicEvent, type EventWithMeta } from "@/lib/loaders/events";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import EventCard from "@/components/event/EventCard";
import WeekStrip from "@/components/event/WeekStrip";
import TonightRail from "@/components/event/TonightRail";
import CategoryJumpTiles from "@/components/event/CategoryJumpTiles";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Live event feeds from Downtown Frederick Partnership, Celebrate Frederick, the County, and Hood College.",
};

export const revalidate = 3600;

/**
 * /events — the magazine-front-of-the-county.
 *
 * Mobile-first redesign matching the rest of the recent batch
 * (/now weather, /plan, /pulse). Same beats: a cinematic hero, a
 * tight editorial masthead, scannable secondary surfaces.
 *
 * Composition, top to bottom:
 *   1. CINEMATIC HERO — the next photo-backed featured event takes
 *      a full-bleed magazine card with serif overlay. If nothing
 *      photo-backed is on deck, a SeasonalPhoto + serif "Events"
 *      headline carries the moment so the page never opens cold.
 *   2. TIGHT MASTHEAD — eyebrow + serif H1 + a single meta strip
 *      (events / towns / live count) in tabular pills, plus a
 *      "Month view" pill on the right.
 *   3. WEEK STRIP — 14-day rail with activity bars per day. Tap a
 *      day to filter the explorer.
 *   4. TONIGHT RAIL — editorial marquee for events starting in the
 *      next ~6 hours (widens to 24h if the evening is thin).
 *   5. CATEGORY JUMP TILES — entry points to deeper category
 *      surfaces (music, arts, family, civic).
 *   6. EVENTS EXPLORER — the single primary browse surface with
 *      lens chips (Tonight / Weekend / Free) at the top.
 *   7. MUNICIPAL SERIES — quiet series-level summary block.
 *   8. HONESTY FOOTER — what feeds, where to submit.
 *
 * Server-rendered. Pure data composition; the explorer below is
 * the only client surface and owns all the filter state via URL
 * params for shareable deep links.
 */
export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const seedLive = eventsLive(now);
  const curatedUpcoming = allUpcoming(now);

  const [{ events: liveEventsRaw }, ingestedSeries, ingestedSummary, tmEvents, bitEvents] =
    await Promise.all([
      getLiveEvents(60),
      getIngestedSeries(),
      getIngestedSummary(),
      fetchTicketmasterMusic().catch(() => []),
      fetchBandsintownForArtists([]).catch(() => []),
    ]);

  // Live/county events + real live-music feeds, with curated duplicates
  // dropped (P0-4). Civic-meeting rows stripped so they don't bury
  // everything else.
  const liveCards = dedupeLiveAgainstCurated(
    [...liveEventsRaw, ...tmEvents, ...bitEvents]
      .map(liveToCardEvent)
      .filter((e) => !isCivicEvent(e)),
    curatedUpcoming,
  );

  // One unified, deduplicated, time-sorted set the explorer drives.
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
  // already reflects it.
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") sp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") sp.set(k, v[0]);
  }
  const initialView: ViewState = parseViewState(sp);
  const dParam = sp.get("d");
  const initialDay =
    dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) ? dParam : undefined;

  const liveCount = liveCards.length;

  // Hero feature — the next photo-backed upcoming event. If none, we
  // fall back to a SeasonalPhoto + serif headline so the page never
  // opens cold without imagery.
  const heroEvent = allEvents.find((e) => Boolean(e.hero_image)) ?? null;

  // "Tonight" rail — events starting in the next 6 hours (widening to
  // next-24 after 8pm so the rail isn't empty at night).
  const tonightEnd = new Date(now);
  tonightEnd.setHours(tonightEnd.getHours() + 6);
  const tonightEvents = allEvents.filter((e) => {
    const t = +new Date(e.starts_at);
    return t >= +now && t <= +tonightEnd;
  });
  const tonightFinal =
    tonightEvents.length >= 3
      ? tonightEvents
      : allEvents
          .filter((e) => {
            const t = +new Date(e.starts_at);
            return t >= +now && t <= +start24;
          })
          .slice(0, 8);

  // Weekend count — feeds the masthead meta strip's "X this weekend"
  // pill so the user gets a useful at-a-glance number without scrolling
  // down to the explorer.
  const weekendCount = allEvents.filter((e) => {
    const t = +new Date(e.starts_at);
    return t >= +friday && t <= +monday;
  }).length;

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      {/* ── 1. Cinematic hero ────────────────────────────────────────
          When we have a photo-backed upcoming event, lead with the
          feature-variant EventCard wrapped in a "Tonight's marquee"
          eyebrow so the magazine intent is explicit. When we don't,
          fall back to a SeasonalPhoto with a serif overlay so the
          page never opens cold without imagery. */}
      {heroEvent ? (
        <section aria-label="Featured event" className="space-y-2">
          <p
            className="eyebrow inline-flex items-center gap-1.5"
            style={{ color: "var(--app-ink-3)" }}
          >
            <Sparkles
              className="h-3 w-3"
              strokeWidth={2.25}
              style={{ color: "var(--app-brand)" }}
              aria-hidden
            />
            Featured event
          </p>
          <EventCard event={heroEvent} variant="feature" />
        </section>
      ) : (
        <header className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-[var(--app-radius-lg)]">
          <div className="relative h-44 w-full sm:h-52" aria-hidden>
            <SeasonalPhoto
              season="auto"
              alt=""
              priority
              sizes="(max-width: 768px) 100vw, 640px"
              className="absolute inset-0"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.18) 55%, transparent 90%)",
              }}
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-4 sm:p-5">
            <p className="eyebrow text-white/85">Live across the county</p>
            <h1 className="font-serif text-[34px] font-semibold leading-[1.02] tracking-tight text-white">
              Events
            </h1>
          </div>
        </header>
      )}

      {/* ── 2. Editorial masthead ─────────────────────────────────────
          Only renders when the cinematic hero used a real event card
          (the SeasonalPhoto fallback already carries the H1). Tight
          row: eyebrow + serif title + meta-pill strip + Month-view
          pill. The pills mirror the meta chips on /plan + /pulse so
          the visual language carries across the redesigned pages. */}
      {heroEvent && (
        <header className="space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
                Live across the county
              </p>
              <h1
                className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                Events
              </h1>
            </div>
            <Link
              href="/events/calendar"
              className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--app-bg-elevated)",
                color: "var(--app-ink-2)",
              }}
            >
              <CalendarDays
                className="h-3.5 w-3.5"
                strokeWidth={2.25}
                aria-hidden
              />
              Month view
            </Link>
          </div>
          <ul
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Events summary"
          >
            <Meta>
              <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              <span className="font-bold tabular-nums">{allEvents.length}</span>
              {allEvents.length === 1 ? " event" : " events"}
            </Meta>
            <Meta>
              <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              <span className="font-bold tabular-nums">{towns.length}</span>{" "}
              {towns.length === 1 ? "town" : "towns"}
            </Meta>
            {weekendCount > 0 && (
              <Meta accent="var(--app-brand)">
                <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                <span className="font-bold tabular-nums">{weekendCount}</span>{" "}
                this weekend
              </Meta>
            )}
            {liveCount > 0 && (
              <Meta accent="var(--app-positive)">
                <span className="live-dot" />
                <span className="font-bold tabular-nums">{liveCount}</span> live
                feed{liveCount === 1 ? "" : "s"}
              </Meta>
            )}
          </ul>
        </header>
      )}

      {/* ── 3. Week strip — 14 days, activity-bar density.
          Tap a day to filter the explorer. No tile borders; visual
          rhythm comes from the activity bars. */}
      <WeekStrip events={allEvents} activeDay={initialDay} />

      {/* ── 4. Tonight rail — editorial marquee of next ~6 hours.
          Photo-led horizontal rail; this is the answer to "what's
          actually starting soon." */}
      {tonightFinal.length > 0 && <TonightRail events={tonightFinal} />}

      {/* ── 5. Category jump tiles — visual entry to deeper surfaces. */}
      <CategoryJumpTiles events={allEvents} />

      {/* ── 6. Events explorer — the primary browse surface.
          Lens chips (Tonight / Tomorrow / Weekend / This week / Free)
          live at the top and own all the filter state via URL params.
          One list, one filter row, one mental model. */}
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

      {/* ── 7. Municipal series — quiet series-level summary block. */}
      {ingestedSeries.length > 0 && (
        <MunicipalEvents series={ingestedSeries} summary={ingestedSummary} />
      )}

      {/* ── 8. Honesty footer ───────────────────────────────────────── */}
      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Live event data pulled from Downtown Frederick Partnership,
          Celebrate Frederick, the Frederick County calendar, and the
          Hood College Trumba feed. Cached for one hour.
        </p>
        <p>
          Missing an event?{" "}
          <a
            href="/submit/event"
            className="underline"
            style={{ color: "var(--app-cool)" }}
          >
            Submit it →
          </a>
        </p>
      </footer>
    </div>
  );
}

/**
 * Meta — small pill that mirrors the meta chips on /plan and /pulse.
 * Accent-tinted background by default; pass an accent to highlight a
 * specific stat (e.g. weekend count in brand, live count in positive).
 */
function Meta({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <li
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] tabular-nums"
      style={{
        background: accent
          ? `color-mix(in srgb, ${accent} 12%, transparent)`
          : "var(--app-bg-elevated)",
        color: accent ?? "var(--app-ink-2)",
      }}
    >
      {children}
    </li>
  );
}
