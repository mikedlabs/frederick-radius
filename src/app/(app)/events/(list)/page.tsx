import type { Metadata } from "next";
import { featuredEventSlugs } from "@/lib/events/featured";
import { Suspense } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { eventsLive } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { classifyEvent } from "@/lib/events/classify";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import {
  initialEventsForBrowse,
  prepareEventsForBrowse,
  slimEventForBrowse,
  summarizeEventsForBrowse,
} from "@/lib/events/browsePayload";
import EventsExplorer from "@/components/event/EventsExplorer";
import FreshnessGuard from "@/components/today/FreshnessGuard";
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

export const metadata: Metadata = {
  alternates: { canonical: "/events" },
  title: "Events",
  description: "Browse event listings from official calendars and ticketing feeds across Frederick County.",
  openGraph: { title: "Events", description:
    "Browse event listings from official calendars and ticketing feeds across Frederick County." },
};

// 5 min: the "Tonight" hero + weekend buckets are computed against now,
// so a tight window keeps them from drifting stale. This page is now a
// STATIC (ISR) shell — see the restructure note below — so revalidate is
// the ONLY staleness bound; the warm cron keeps the feed caches hot
// underneath, which makes the revalidation render cheap.
export const revalidate = 300;

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
 *
 * STATIC + BOUNDED SSR (owner-approved 2026-07): this page does not read
 * `searchParams`, keeping the route on five-minute ISR instead of paying a
 * cold feed render on every request. EventsExplorer uses server-safe defaults,
 * so the prebuilt HTML now contains real horizon cards instead of a client-only
 * skeleton. It receives six cards per horizon plus compact count summaries;
 * filters, expansion, sorting and alternate views fetch the full cached set
 * from /api/events/browse only after hydration and explicit browsing intent.
 */
export default async function EventsIndexPage() {
  const now = new Date();

  // Shared, intentionally NOT awaited here — see the streaming note above. A
  // single awaited promise resolves once across both consumers below, and
  // assembleUnifiedEvents is itself unstable_cache-wrapped.
  const eventsPromise = assembleUnifiedEvents(now);

  return (
    <div className="relative space-y-4">
      <PageBloom variant="warm-cool" />

      {/* Freshness guard (build review): /events is ISR + carries day-relative
          labels ("today", weekday dateline), so a cached shell served on a
          later day would mislabel the calendar. Same self-healing guard /today
          uses: silent one-time reload, then an honest "rendered on {day}" banner. */}
      <FreshnessGuard renderedAtIso={now.toISOString()} />

      {/* ── THE BOARD — EventsBoardDock owns the single "What's on" nameplate,
          one filter doorway, and the compact result controls. What, When, and
          Where live inside the filter sheet so the first event can reach the
          initial viewport. Everything event-dependent still streams behind
          the boundary below so the route stays a static (ISR) shell. */}
      <Suspense
        fallback={
          <div className="min-h-[calc(100dvh-var(--app-topbar-h))]">
            <SlowSuspenseFallback
              label="Events are taking longer than usual to load."
              altHref="/map"
              altLabel="Open the map"
            >
              <Skeleton.Block height={420} round="var(--app-radius-lg)" />
            </SlowSuspenseFallback>
          </div>
        }
      >
        <EventsBoard now={now} eventsPromise={eventsPromise} />
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
          Event listings come from Celebrate Frederick, the Frederick
          County calendar, Ticketmaster (music + Frederick Keys home
          games), Bandsintown, the Weinberg Center lineup, and the county
          municipal calendars. Live feeds are checked about every 15 minutes.
        </p>
        <p>
          Missing an event?{" "}
          <a
            href="/submit/event"
            className="tap-44-y inline-flex min-h-11 items-center underline"
            style={{ color: "var(--app-cool)" }}
          >
            Submit it <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
          </a>
        </p>
      </footer>
    </div>
  );
}

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/**
 * The event-dependent body: the explorer board + the fenced "Government &
 * notices" sections. Awaits the shared events promise (plus the ingested civic
 * series, which is fail-soft) and does all the derivation the page used to do
 * inline at the top of the server component.
 */
async function EventsBoard({
  now,
  eventsPromise,
}: {
  now: Date;
  eventsPromise: EventsPromise;
}) {
  const seedLive = eventsLive(now);

  // The unified set is assembled in lib/loaders/unifiedEvents, the SAME
  // function /today counts from, so the two surfaces can never disagree
  // about "this weekend" again. All sources inside it are fail-soft; the
  // civic ingest below keeps the same .catch guards. Feed failures must
  // never block or break /events.
  const [{ unified, publicEvents, sourceHealth }, ingestedSeries, ingestedSummary] =
    await Promise.all([
      eventsPromise,
      getIngestedSeries().catch(() => []),
      getIngestedSummary().catch(() => ({ total: 0, series: 0, recurring: 0 })),
    ]);
  const civicEvents = unified.filter((e) => classifyEvent(e) === "civic_meeting").map(slimEventForBrowse);
  const reminderEvents = unified.filter((e) => classifyEvent(e) === "town_reminder").map(slimEventForBrowse);
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
  const catSlugs = [...new Set(publicEvents.map((e) => e.category).filter(Boolean))];
  const categories = catSlugs
    .map((s) => ({ slug: s, name: CATEGORY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const townSlugs = [...new Set(publicEvents.map((e) => e.municipality).filter(Boolean))];
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
  // Build one compact complete collection, then serialize only a useful first
  // window into the page. The complete set stays behind /api/events/browse and
  // is fetched only after an explicit filter, expansion, sort or view change.
  // This is the main /events payload fix: the first response no longer embeds
  // hundreds of event records in both HTML and React Flight data.
  const browseEvents = prepareEventsForBrowse(publicEvents, bounds);
  const initialEvents = initialEventsForBrowse(
    browseEvents,
    bounds,
    undefined,
    featuredEventSlugs(now),
  );
  const browseSummary = summarizeEventsForBrowse(browseEvents, bounds);
  const friday = new Date(bounds.weekendStart);
  const monday = new Date(bounds.weekendEnd);
  const todayEnd = new Date(bounds.next24);

  // The deep-link view (?cats/?m/?when/?d) is parsed CLIENT-side now —
  // EventsExplorer and EventWeekRibbon read the URL themselves, which is
  // what keeps this route static (reading searchParams here would opt
  // the whole page out of ISR).

  // Structured data (June-9 audit P2): the listing as an ItemList of the
  // next public events, mirroring what the page renders.
  const eventsJsonLd = itemListJsonLd(
    "Events in Frederick County",
    browseEvents.slice(0, 25).map((e) => ({ name: e.title, path: `/events/${e.slug}` })),
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
      {/* EventsExplorer intentionally avoids router query hooks so this STATIC
          route can server-render its useful first horizon. URL preferences are
          applied after hydration; any non-default view then requests the cached
          continuation endpoint. The week ribbon remains in the When pane. */}
      <div className="min-h-[calc(100dvh-var(--app-topbar-h))]">
        <EventsExplorer
          events={initialEvents}
          liveSlugs={liveSlugs}
          categories={categories}
          towns={towns}
          summary={browseSummary}
          sourceHealth={sourceHealth}
          nowISO={now.toISOString()}
          next24ISO={todayEnd.toISOString()}
          weekendStartISO={friday.toISOString()}
          weekendEndISO={monday.toISOString()}
        />
      </div>

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
          className="[&>button]:min-h-11"
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
          className="[&>button]:min-h-11"
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
          className="[&>button]:min-h-11"
        >
          <MunicipalEvents series={civicSeries} summary={ingestedSummary} />
        </CollapsibleSection>
      )}

      {/* ── 8. SUBSCRIBE — the county in your own calendar app. webcal://
          is the subscription protocol every major calendar client claims
          (Apple/Outlook natively; Google via "from URL"), backed by
          /api/calendar/[feed]. The feed refreshes itself, so additions and
          cancellations arrive without reopening the app. */}
      <section aria-labelledby="events-subscribe-heading" className="border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
        <h2
          id="events-subscribe-heading"
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          Put the county on your calendar
        </h2>
        <p className="mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Subscribe once and your calendar keeps itself current, new events and cancellations
          included. Works with Apple, Google, and Outlook calendars.
        </p>
        <ul className="mt-3 space-y-1.5">
          <li>
            <a
              href="webcal://frederickradius.app/api/calendar/all.ics"
              className="tap-44-y inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold underline decoration-[var(--app-brand)] underline-offset-4"
              style={{ color: "var(--app-ink)" }}
            >
              All county events
              <span className="font-mono text-[10.5px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                next 30 days
              </span>
            </a>
          </li>
          <li>
            <a
              href="webcal://frederickradius.app/api/calendar/live-music.ics"
              className="tap-44-y inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold underline decoration-[var(--app-brand)] underline-offset-4"
              style={{ color: "var(--app-ink)" }}
            >
              Live music only
              <span className="font-mono text-[10.5px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                next 30 days
              </span>
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
