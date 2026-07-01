import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { eventsLive } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { classifyEvent } from "@/lib/events/classify";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import EventCard from "@/components/event/EventCard";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";
import { LIFTED_INGEST_SOURCES } from "@/lib/loaders/ingestedEvents";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import Skeleton from "@/components/ui/Skeleton";
import SlowSuspenseFallback from "@/components/ui/SlowSuspenseFallback";

/**
 * Slim an event before it crosses into a client component.
 *
 * The events page serializes every event twice: once as rendered HTML and
 * once as React Flight data in the script payload. A live audit measured
 * /events at 787 KB with 52 percent of that inside script tags. The cards
 * never render a description, and the only client consumer of the field is
 * the explorer search, which matches the opening text of the title, venue,
 * and description. Capping the description to its first 160 characters here
 * removes the largest per row field from the duplicated payload without
 * changing a single rendered card and without breaking search on the
 * opening sentence. The full description still lives on the event detail
 * page, which loads its own record.
 */
function slimEventForClient<T extends { description?: string }>(e: T): T {
  // Drop provenance fields no client surface renders (the explorer reads
  // category_name + the rendered event fields only), then clamp long
  // descriptions — both shrink the /events RSC payload + hydration.
  const {
    source_id: _si, license: _lic, confidence: _cf,
    first_seen_at: _fs, last_verified_at: _lv, geo_confidence: _gc,
    ...rest
  } = e as T & {
    source_id?: unknown; license?: unknown; confidence?: unknown;
    first_seen_at?: unknown; last_verified_at?: unknown; geo_confidence?: unknown;
  };
  void _si; void _lic; void _cf; void _fs; void _lv; void _gc;
  const slim = rest as unknown as T;
  const d = slim.description;
  if (!d || d.length <= 160) return slim;
  return { ...slim, description: d.slice(0, 160) };
}

export const metadata: Metadata = {
  alternates: { canonical: "/events" },
  title: "Events",
  description:
    "Live event feeds from Celebrate Frederick, the County calendar, Ticketmaster (including the Frederick Keys), Bandsintown, and the Weinberg Center lineup.",
  openGraph: { title: "Events", description:
    "Live event feeds from Celebrate Frederick, the County calendar, Ticketmaster (including the Frederick Keys), Bandsintown, and the Weinberg Center lineup." },
};

// 10 min, not an hour: the "Tonight" hero + weekend buckets are computed
// against now, so a tighter window keeps them from drifting stale.
export const revalidate = 600;

/**
 * /events — DISCOVERY-FIRST: one premium masthead + one results region.
 *
 * The previous page ran FIVE overlapping schemes (Best-next feature, week
 * ribbon, Tonight rail, Weekend-by-vibe, mood tiles, Later-this-week) that
 * each re-sliced the SAME events on top of a collapsed explorer — the
 * sprawl that made it "hard to understand." This collapses to:
 *
 *   1. HEADER — the almanac nameplate (dateline + serif title + mono count
 *      + vermilion tick). Server-rendered, premium, typography-first.
 *   2. THE BOARD — EventsExplorer promoted to the page body (no longer a
 *      collapsed power tool): quick doorways (Today / This weekend / Live
 *      music / Free / Happy hour / Family / Civic) steer ONE reflowing
 *      horizon spine (feature lead + glance cards), with map + search +
 *      lenses on the same filtered set. Every event lands in exactly once.
 *   3. GOVERNMENT & NOTICES — civic meetings + town reminders + the
 *      municipal series, fenced off at the bottom, collapsed.
 *   4. HONESTY FOOTER — what feeds, where to submit.
 *
 * Server-rendered shell; the explorer is the client browse surface and
 * owns its filter state via URL params. HONESTY: every card + time is
 * restyled from data already present — nothing is invented.
 *
 * STREAMING (audit: unified-events cold-miss): the masthead identity (rule +
 * dateline + serif title) is event-independent and paints on the first byte;
 * the count line and the entire board await the ONE shared events promise
 * inside their own <Suspense> boundaries, so a cold ISR miss streams the board
 * in instead of holding the whole page on the slowest third-party feed.
 */
export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();

  // Shared, intentionally NOT awaited here — see the streaming note above. A
  // single awaited promise resolves once across both consumers below, and
  // assembleUnifiedEvents is itself unstable_cache-wrapped.
  const eventsPromise = assembleUnifiedEvents(now);

  // Masthead dateline — Eastern "Mon · Jun 15" for the almanac nameplate.
  // Event-independent, so it renders immediately.
  const dlWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const dlDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(now);

  return (
    <div className="relative space-y-4">
      <PageBloom variant="warm-cool" />

      {/* ── HEADER — the almanac nameplate. Premium masthead: a hairline
          rule, a "Frederick County / Mon · Jun 15" dateline, the serif
          title dropping into an italic continuation, a mono count, and a
          single vermilion accent tick. Typography carries it; high contrast
          on the deepened paper ground. */}
      <header className="pt-0.5">
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {dlWeekday} &middot; {dlDate}
          </span>
        </div>
        <h1
          className="font-serif text-[32px] font-semibold leading-[0.98] tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          What&rsquo;s on
          <span className="block font-medium italic" style={{ color: "var(--app-ink-2)" }}>
            in Frederick County
          </span>
        </h1>
        {/* Count line streams in with the feed; reserve its line height so the
            tick below doesn't jump when the numbers arrive. */}
        <Suspense
          fallback={
            <p className="mt-2 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
              &nbsp;
            </p>
          }
        >
          <EventCounts eventsPromise={eventsPromise} />
        </Suspense>
        <div
          aria-hidden
          className="mt-2.5 h-[3px] w-[42px] rounded-full"
          style={{ background: "var(--app-brand)", boxShadow: "0 1px 4px color-mix(in srgb, var(--app-brand) 40%, transparent)" }}
        />
      </header>

      {/* ── THE BOARD — the explorer + the fenced civic sections, all
          event-dependent, streamed behind one boundary so the masthead never
          waits on the feeds. */}
      <Suspense
        fallback={
          <SlowSuspenseFallback
            label="Events are taking longer than usual to load."
            altHref="/map"
            altLabel="Open the map"
          >
            <Skeleton.Block height={420} round="var(--app-radius-lg)" />
          </SlowSuspenseFallback>
        }
      >
        <EventsBoard searchParams={searchParams} now={now} eventsPromise={eventsPromise} />
      </Suspense>

      {/* ── Honesty footer — static, so it never waits on the feeds. ──── */}
      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        {/* Honesty footer = TRUE sources only (June-9 automation audit):
            DFP killed their public iCal and the Hood Trumba feed is gone;
            naming dead feeds in the trust block was the opposite of trust. */}
        <p>
          Live event data pulled from Celebrate Frederick, the Frederick
          County calendar, Ticketmaster (music + Frederick Keys home
          games), Bandsintown, the Weinberg Center lineup, and the county
          municipal calendars. Refreshed about every 10 minutes.
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

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/** The masthead count line ("N events · M towns"), streamed from the shared
 *  events promise so the serif title above it paints first. */
async function EventCounts({ eventsPromise }: { eventsPromise: EventsPromise }) {
  const { publicEvents } = await eventsPromise;
  const eventCount = publicEvents.length;
  const townCount = new Set(publicEvents.map((e) => e.municipality).filter(Boolean)).size;
  return (
    <p className="mt-2 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
      <span style={{ color: "var(--app-brand-press)" }}>{eventCount}</span> events &middot;{" "}
      <span style={{ color: "var(--app-brand-press)" }}>{townCount}</span> towns
    </p>
  );
}

/**
 * The event-dependent body: the explorer board + the fenced "Government &
 * notices" sections. Awaits the shared events promise (plus the ingested civic
 * series, which is fail-soft) and does all the derivation the page used to do
 * inline at the top of the server component.
 */
async function EventsBoard({
  searchParams,
  now,
  eventsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  now: Date;
  eventsPromise: EventsPromise;
}) {
  const seedLive = eventsLive(now);

  // The unified set is assembled in lib/loaders/unifiedEvents, the SAME
  // function /today counts from, so the two surfaces can never disagree
  // about "this weekend" again. All sources inside it are fail-soft; the
  // civic ingest below keeps the same .catch guards. Feed failures must
  // never block or break /events.
  const [{ unified, publicEvents }, ingestedSeries, ingestedSummary] =
    await Promise.all([
      eventsPromise,
      getIngestedSeries().catch(() => []),
      getIngestedSummary().catch(() => ({ total: 0, series: 0, recurring: 0 })),
    ]);
  // Slim every event before it crosses into a client component. Cards never
  // render a description, and only the explorer search reads it, so capping
  // it removes the largest per row field from the duplicated RSC payload.
  const allEvents = publicEvents.map(slimEventForClient);
  const civicEvents = unified.filter((e) => classifyEvent(e) === "civic_meeting").map(slimEventForClient);
  const reminderEvents = unified.filter((e) => classifyEvent(e) === "town_reminder").map(slimEventForClient);
  const liveSlugs = seedLive.map((e) => e.slug);

  // The ingested "Civic & municipal calendar" series is a SEPARATE data
  // source (the daily-ingest table), so it must run through the same
  // classifier — otherwise a private rental ("Attaboy … Wedding") or a
  // CANCELLED meeting that landed in the feed renders raw (the live-audit
  // leak). Keep civic/municipal/public series; drop private rentals and
  // cancelled outright, exactly as the card lanes do.
  const publicSeries = ingestedSeries.filter((s) => {
    const lane = classifyEvent({ title: s.title, category: s.category ?? undefined });
    if (lane === "private_rental" || lane === "cancelled") return false;
    // The lifted sources' (FCPL/FCVFRA) PUBLIC draws now appear in the main
    // rails above, so keep them out of this civic strip — no double-listing.
    // Their civic/reminder rows (none today, but future-proof) still belong here.
    if (lane === "public" && LIFTED_INGEST_SOURCES.has(s.sourceDomain)) return false;
    return true;
  });
  // PAYLOAD WINDOW (perf audit: /events shipped 1.28MB HTML, 913KB of it
  // inline RSC — and the driver wasn't the explorer, it was THIS
  // collapsed-by-default civic module receiving every ingested series
  // with full descriptions + occurrence arrays). Serialize only what the
  // tucked view can show: series starting in the next 30 days, capped at
  // 80, 4 occurrences each. The header's "270 series" count comes from
  // `summary`, which stays complete — the number stays honest.
  const civicWindowMs = +now + 30 * 864e5;
  const civicSeries = publicSeries
    .filter((s) => +new Date(s.nextStart) <= civicWindowMs)
    .slice(0, 80)
    .map((s) => ({
      ...s,
      description: s.description ? s.description.slice(0, 160) : null,
      occurrences: s.occurrences.slice(0, 4),
    }));

  // Facet lists, only for values actually present.
  const catSlugs = [...new Set(allEvents.map((e) => e.category).filter(Boolean))];
  const categories = catSlugs
    .map((s) => ({ slug: s, name: CATEGORY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const townSlugs = [...new Set(allEvents.map((e) => e.municipality).filter(Boolean))];
  const towns = townSlugs
    .map((s) => ({ slug: s, name: MUNICIPALITY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Server-computed window boundaries, in America/New_York wall time, from
  // ONE source: buildHorizonBounds. This carries the weekend fix — when
  // today is Fri/Sat/Sun the "This weekend" window CONTAINS today, instead
  // of the old inline daysToFri math that jumped to NEXT Friday the moment
  // it was already the weekend (so a Saturday showed next weekend). next24
  // is the next Eastern midnight, so "Today" never spills into tomorrow.
  const bounds = buildHorizonBounds(now, new Set(liveSlugs));
  const friday = new Date(bounds.weekendStart);
  const monday = new Date(bounds.weekendEnd);
  const todayEnd = new Date(bounds.next24);

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

  // Structured data (June-9 audit P2): the listing as an ItemList of the
  // next public events, mirroring what the page renders.
  const eventsJsonLd = itemListJsonLd(
    "Events in Frederick County",
    allEvents.slice(0, 25).map((e) => ({ name: e.title, path: `/events/${e.slug}` })),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(eventsJsonLd) }}
      />

      {/* ── THE BOARD — the explorer IS the page body now. It was a
          collapsed "Browse & search" power tool buried beneath five tiered
          sections (Best-next, week ribbon, Tonight rail, Weekend vibes,
          mood tiles, Later-this-week) that each re-sliced the SAME events —
          the sprawl that made the page hard to understand. Those are gone;
          the explorer's quick doorways + reflowing horizon spine (feature
          lead + glance cards) + map + search are now the single results
          region, so every event lands in exactly one place. */}
      <EventsExplorer
        events={allEvents}
        liveSlugs={liveSlugs}
        categories={categories}
        towns={towns}
        nowISO={now.toISOString()}
        next24ISO={todayEnd.toISOString()}
        weekendStartISO={friday.toISOString()}
        weekendEndISO={monday.toISOString()}
        initialView={initialView}
        initialDay={initialDay}
      />

      {/* ── 6b. GOVERNMENT & NOTICES — civic meetings + town reminders,
          fenced off from social discovery by a clear divider + label so
          municipal listings never read as "something to do". The #civic-
          meetings anchor is the target of the Civic mood tile above. */}
      {(civicEvents.length > 0 || reminderEvents.length > 0) && (
        <div
          id="civic-meetings"
          className="flex items-center gap-3 scroll-mt-20 pt-2"
        >
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden />
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
            <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Government &amp; notices
          </span>
          <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden />
        </div>
      )}

      {/* CIVIC MEETINGS — boards, commissions, hearings, council sessions
          classified out of the live feed. Present + findable in their own
          lane, never in "What's on". COLLAPSED, self-hides. */}
      {civicEvents.length > 0 && (
        <CollapsibleSection
          title="Civic meetings"
          count={civicEvents.length}
          countLabel={civicEvents.length === 1 ? "meeting" : "meetings"}
          countAriaOnly
          storageKey="fr.events.civic-meetings"
          defaultOpen={false}
        >
          <ol className="space-y-2">
            {civicEvents.slice(0, 24).map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}>
                <EventCard event={e} variant="glance" live={liveSlugs.includes(e.slug)} />
              </li>
            ))}
          </ol>
        </CollapsibleSection>
      )}

      {/* ── 6c. TOWN REMINDERS — municipal service notices (trash, yard
          waste, curbside, closures). Useful, but not "something to do". */}
      {reminderEvents.length > 0 && (
        <CollapsibleSection
          title="Town reminders"
          count={reminderEvents.length}
          countLabel={reminderEvents.length === 1 ? "notice" : "notices"}
          countAriaOnly
          storageKey="fr.events.town-reminders"
          defaultOpen={false}
        >
          <ol className="space-y-2">
            {reminderEvents.slice(0, 24).map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}>
                <EventCard event={e} variant="glance" live={false} />
              </li>
            ))}
          </ol>
        </CollapsibleSection>
      )}

      {/* ── 7. CIVIC & MUNICIPAL CALENDAR — the long tail of recurring
          municipal series + notices (the ingested calendar), COLLAPSED by
          default so municipal gravity never competes with the events above.
          Present but tucked, never dumped. */}
      {publicSeries.length > 0 && (
        <CollapsibleSection
          title="Civic & municipal calendar"
          count={publicSeries.length}
          countLabel="series"
          countAriaOnly
          storageKey="fr.events.official"
          defaultOpen={false}
        >
          <MunicipalEvents series={civicSeries} summary={ingestedSummary} />
        </CollapsibleSection>
      )}
    </>
  );
}
