import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Sparkles, Moon } from "lucide-react";
import { allUpcoming, eventsLive, dedupeLiveAgainstCurated, dedupeCuratedClusters, type EventWithMeta } from "@/lib/loaders/events";
import { classifyEvent, isPublicEvent } from "@/lib/events/classify";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import EventCard from "@/components/event/EventCard";
import WeekendVibes from "@/components/event/WeekendVibes";
import TonightRail from "@/components/event/TonightRail";
import NowDayStrip from "@/components/today/NowDayStrip";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import { fetchTicketmasterMusic, fetchTicketmasterSports } from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { venueEventsAsCards } from "@/lib/loaders/venueEvents";
import { collapseRecurringEvents } from "@/lib/events/normalize";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";
import PageBloom from "@/components/ui/PageBloom";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

/**
 * One honest "why it matters" line for the hero — the first sentence of
 * the event's own description, trimmed to a clause length that reads as
 * a caption, not a paragraph. Returns undefined when there's nothing to
 * say, so the hero never shows a fabricated or empty line (the HONESTY
 * RULE: only ever restyle data that's already there).
 */
function whyItMatters(e: EventWithMeta): string | undefined {
  const desc = (e.description ?? "").trim();
  if (!desc) return undefined;
  // First sentence (up to the first ., ! or ?), else the whole thing.
  const m = desc.match(/^.*?[.!?](?=\s|$)/);
  let line = (m ? m[0] : desc).trim();
  // Guard against a runaway "sentence" (some feeds omit punctuation).
  if (line.length > 150) line = `${line.slice(0, 147).trimEnd()}…`;
  return line || undefined;
}

export const metadata: Metadata = {
  alternates: { canonical: "/events" },
  title: "Events",
  description:
    "Live event feeds from Downtown Frederick Partnership, Celebrate Frederick, the County, Hood College, and the Frederick Keys.",
};

// 10 min, not an hour: the "Tonight" hero + weekend buckets are computed
// against now, so a tighter window keeps them from drifting stale.
export const revalidate = 600;

/**
 * /events — TIERED, progressively-disclosed front-of-the-county.
 *
 * The old page led with a flat, equal-weight list — "a spreadsheet with
 * nicer shoes." This redesign leads with the ANSWER, not the calendar,
 * and maps visual weight to importance so the page reads as tiered and
 * calm instead of a wall.
 *
 * Composition, top to bottom (each tucked behind a CollapsibleSection
 * with a count, so secondary weight is present but never dumped):
 *
 *   1. MASTHEAD — eyebrow + serif H1 + Plan / Month-view pivots.
 *   2. WEEK STRIP — 7-day rail; tap a day to deep-link the explorer.
 *   3. "TONIGHT" (open) — ONE hero event (the soonest, photo or
 *      category-art) carrying a real "why it matters" line, plus a
 *      highlights rail of what's starting soon. When the evening is
 *      empty the hero honestly leads with the next event up.
 *   4. "THIS WEEKEND" (open) — glance cards grouped by VIBE
 *      (music / food / family / arts / outdoors / civic).
 *   5. "LATER THIS WEEK" (collapsed) — the rest of the next 7 days,
 *      as a dense glance list. "Show N more."
 *   6. "BROWSE & SEARCH ALL EVENTS" (collapsed) — the full explorer
 *      (search, lenses, map, calendar) as the power tool, not the
 *      lead.
 *   7. "CIVIC & MUNICIPAL CALENDAR" (collapsed) — the long tail of
 *      meetings, recurring pickups, municipal notices. Tucked.
 *   8. HONESTY FOOTER — what feeds, where to submit.
 *
 * Server-rendered. Pure data composition; the explorer is the only
 * client browse surface and owns its own filter state via URL params.
 * HONESTY: every card, time, and "why it matters" line is restyled
 * from data already present — nothing is invented.
 */
export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const seedLive = eventsLive(now);
  const curatedUpcoming = allUpcoming(now);

  // Every async source here is fail-soft: a hung or throwing provider
  // degrades to its empty fallback and the page still renders from seed +
  // curated data (both synchronous, above). The live feeds already cap
  // each fetch at FEED_FETCH_TIMEOUT_MS internally; these .catch guards
  // ensure an *unexpected* throw (DB blip, parse error) can't take the
  // page down either. "Feed failures must never block or break /events."
  const [
    { events: liveEventsRaw },
    ingestedSeries,
    ingestedSummary,
    tmMusic,
    tmSports,
    bitEvents,
  ] = await Promise.all([
    getLiveEvents(60).catch(() => ({
      events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
    })),
    getIngestedSeries().catch(() => []),
    getIngestedSummary().catch(() => ({ total: 0, series: 0, recurring: 0 })),
    fetchTicketmasterMusic().catch(() => []),
    // Sports adds the Frederick Keys home schedule (Nymeo Field, MiLB)
    // and any other Ticketmaster Sports entries inside the 25-mi geo
    // window. Same fail-soft pattern as the other feeds — a
    // Ticketmaster outage degrades the row, never the page.
    fetchTicketmasterSports().catch(() => []),
    fetchBandsintownForArtists([]).catch(() => []),
  ]);

  // Live/county + music + sports feeds, curated duplicates dropped. NOT
  // civic-filtered here — classification happens ONCE on the unified set
  // below, so meetings/reminders/rentals are laned (or suppressed), never
  // silently dropped from a place they belong.
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(
      [...liveEventsRaw, ...tmMusic, ...tmSports, ...bitEvents].map(liveToCardEvent),
    ),
    curatedUpcoming,
  );

  // Extracted venue lineups (The Banyan, Sky Stage, …) folded into the
  // same feed so a venue with a band tonight reads as an event, not just
  // a place — the "places + events fused" wedge.
  const venueCards = venueEventsAsCards(now);

  // One unified, deduplicated, time-sorted set.
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards, ...venueCards]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  // Second-pass dedup catches CURATED-vs-CURATED duplicates that slip
  // through dedupeLiveAgainstCurated. Picks the richer record per cluster.
  const unified = withVenueThumbs(
    dedupeCuratedClusters(
      [...bySlug.values()].sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      ),
    ),
  );
  // EVENT ELIGIBILITY (P0): only PUBLIC events lead "What's on" + the
  // explorer. Civic meetings and town reminders get their own collapsed
  // lanes below; private rentals + cancelled items are suppressed entirely.
  // "Belongs-to-feed ≠ should-be-promoted." See lib/events/classify.
  const allEvents = unified.filter(isPublicEvent);
  const civicEvents = unified.filter((e) => classifyEvent(e) === "civic_meeting");
  const reminderEvents = unified.filter((e) => classifyEvent(e) === "town_reminder");
  const liveSlugs = seedLive.map((e) => e.slug);

  // The ingested "Civic & municipal calendar" series is a SEPARATE data
  // source (the daily-ingest table), so it must run through the same
  // classifier — otherwise a private rental ("Attaboy … Wedding") or a
  // CANCELLED meeting that landed in the feed renders raw (the live-audit
  // leak). Keep civic/municipal/public series; drop private rentals and
  // cancelled outright, exactly as the card lanes do.
  const publicSeries = ingestedSeries.filter((s) => {
    const lane = classifyEvent({ title: s.title, category: s.category ?? undefined });
    return lane !== "private_rental" && lane !== "cancelled";
  });

  // Facet lists, only for values actually present.
  const catSlugs = [...new Set(allEvents.map((e) => e.category).filter(Boolean))];
  const categories = catSlugs
    .map((s) => ({ slug: s, name: CATEGORY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const townSlugs = [...new Set(allEvents.map((e) => e.municipality).filter(Boolean))];
  const towns = townSlugs
    .map((s) => ({ slug: s, name: MUNICIPALITY_BY_SLUG[s]?.name ?? s }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Server-computed window boundaries. The today + weekend windows MUST
  // be America/New_York wall time — the old server-local setHours(17) put
  // the weekend at ~1 PM ET on a UTC production server (the date-window
  // bug). Mirror the loader's eventsWeekend() ET math.
  const et = easternParts(now);
  const daysToFri = (5 - et.weekday + 7) % 7;
  const friBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + daysToFri, 12)));
  const monBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + daysToFri + 3, 12)));
  const friday = new Date(Date.parse(easternWallToUtcISO(friBase.year, friBase.month, friBase.day, 17, 0)));
  const monday = new Date(Date.parse(easternWallToUtcISO(monBase.year, monBase.month, monBase.day, 0, 0)));
  // End of TODAY in America/New_York (next Eastern midnight). The lead
  // tier is bounded to today, not a rolling +24h — so a section that
  // says "Today" can never quietly include tomorrow's events, and an
  // afternoon event reads honestly as today rather than "Tonight". The
  // day+1 rollover goes through easternParts so month/year-end is safe.
  const todayEndBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + 1, 12)));
  const todayEnd = new Date(Date.parse(easternWallToUtcISO(todayEndBase.year, todayEndBase.month, todayEndBase.day, 0, 0)));

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

  // ── Tier windows (ms; absolute arithmetic, DST-safe) ────────────────
  const nowMs = +now;
  const todayEndMs = +todayEnd;
  const weekendStartMs = +friday;
  const weekendEndMs = +monday;
  const weekEndMs = nowMs + 7 * 864e5;
  const startsMs = (e: EventWithMeta) => +new Date(e.starts_at);

  // HERO — lead with the ANSWER. The soonest upcoming event carries the
  // hero card (the feature variant renders category art when there's no
  // photo, so the page leads with a real event even when nothing is
  // photo-backed — the old "no photo → cold SeasonalPhoto" gap). Live
  // events sort first via allEvents' chronological order + the live set.
  // Prefer the soonest event that actually STARTS in the future, so the
  // featured card never leads with a past start date (e.g. a multi-day
  // event that began last week). Falls back to the soonest in-progress
  // event only when nothing upcoming is left.
  const heroEvent: EventWithMeta | null =
    allEvents.find((e) => +new Date(e.starts_at) >= nowMs) ?? allEvents[0] ?? null;

  // "Today" — events still to come TODAY (now → next Eastern midnight),
  // tonight included. Bounded to today, not a rolling +24h, so the
  // section never silently includes tomorrow. Drives the count + rail.
  const todayEvents = allEvents.filter((e) => {
    const t = startsMs(e);
    return t >= nowMs && t < todayEndMs;
  });
  // Highlights rail under the hero: what's starting soonest. Prefer
  // today; if the day is thin, widen to the soonest upcoming so the
  // rail still answers "what's next." Hero is excluded so it isn't
  // shown twice.
  const highlightPool = (todayEvents.length >= 3 ? todayEvents : allEvents)
    .filter((e) => e.slug !== heroEvent?.slug)
    .slice(0, 8);

  // "This weekend" — Fri 5pm → Mon, grouped by vibe downstream.
  const weekendEvents = allEvents.filter((e) => {
    const t = startsMs(e);
    return t >= weekendStartMs && t < weekendEndMs;
  });

  // "Later this week" — the rest of the next 7 days that isn't already
  // surfaced as Tonight or This weekend, so the tiers don't repeat. The
  // hero is excluded too. Collapsed by default ("Show N more").
  const shownSlugs = new Set<string>([
    ...(heroEvent ? [heroEvent.slug] : []),
    ...todayEvents.map((e) => e.slug),
    ...weekendEvents.map((e) => e.slug),
  ]);
  const laterThisWeek = allEvents.filter((e) => {
    const t = startsMs(e);
    return t >= nowMs && t < weekEndMs && !shownSlugs.has(e.slug);
  });

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      {/* ── 1. Masthead — eyebrow + serif H1 + the two pivots (Plan,
          Month view). The page now leads with the curated tiers below,
          so the masthead stays a quiet title bar, not a hero. */}
      <header className="flex items-end justify-between gap-3">
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
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/plan"
            className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[var(--app-shadow-1)]"
            style={{ background: "var(--app-brand)" }}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Plan an evening
          </Link>
          <Link
            href="/events/calendar"
            className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
          >
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Month view
          </Link>
        </div>
      </header>

      {/* ── 2. Week strip — clickable 7-day rail; a tap deep-links the
          explorer to that Eastern day (?d=YYYY-MM-DD). */}
      {(() => {
        const eventCountByDate = new Map<string, number>();
        for (const e of allEvents) {
          const d = new Date(e.starts_at);
          const key = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/New_York",
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(d);
          eventCountByDate.set(key, (eventCountByDate.get(key) ?? 0) + 1);
        }
        return (
          <NowDayStrip
            hrefForDate={(dk) => `/events?d=${dk}`}
            activeDateKey={initialDay}
            eventCountByDate={eventCountByDate}
          />
        );
      })()}

      {/* ── 3. TODAY — the lead tier (expanded). ONE hero event
          (soonest upcoming) carrying a real "why it matters" line,
          then a highlights rail of what's starting soon. Bounded to
          today (tonight included); when nothing is left today the hero
          honestly reads as "Next up." */}
      {heroEvent && (
        <CollapsibleSection
          title="Today"
          count={todayEvents.length}
          countLabel={todayEvents.length === 1 ? "event" : "events"}
          storageKey="fr.events.today"
          defaultOpen
        >
          <div className="space-y-3">
            {/* The "Today" section header already labels this tier, so the
                redundant "Today's lead" eyebrow is dropped. The eyebrow
                stays only for the QUIET case, where "next up" adds honest
                context the title alone doesn't ("nothing left today"). */}
            {todayEvents.length === 0 && (
              <p
                className="eyebrow inline-flex items-center gap-1.5"
                style={{ color: "var(--app-ink-3)" }}
              >
                <Moon
                  className="h-3 w-3"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-cool)" }}
                  aria-hidden
                />
                Quiet today &middot; next up
              </p>
            )}
            <EventCard
              event={heroEvent}
              variant="feature"
              live={liveSlugs.includes(heroEvent.slug)}
              whyItMatters={whyItMatters(heroEvent)}
            />
            {/* Highlights rail — the few other things starting soon,
                photo-led, so "Tonight" leads with the answer + a short
                marquee, not the whole calendar. */}
            {highlightPool.length > 0 && (
              <TonightRail events={highlightPool} />
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── 4. THIS WEEKEND — expanded, grouped by VIBE so the weekend
          reads by feel (music / food / family / arts / outdoors /
          civic), not as a flat chronological wall. */}
      {weekendEvents.length > 0 && (
        <CollapsibleSection
          title="This weekend"
          count={weekendEvents.length}
          countLabel={weekendEvents.length === 1 ? "event" : "events"}
          storageKey="fr.events.weekend"
          defaultOpen
        >
          <WeekendVibes events={weekendEvents} liveSlugs={liveSlugs} />
        </CollapsibleSection>
      )}

      {/* ── 5. LATER THIS WEEK — the rest of the next 7 days, COLLAPSED
          ("Show N more"). Dense glance list; the long body of the week
          without crowding the lead tiers. */}
      {laterThisWeek.length > 0 && (
        <CollapsibleSection
          title="Later this week"
          count={laterThisWeek.length}
          countLabel={laterThisWeek.length === 1 ? "event" : "events"}
          storageKey="fr.events.later"
          defaultOpen={false}
        >
          <ol className="space-y-2.5">
            {laterThisWeek.slice(0, 24).map((e) => (
              <li key={e.slug}>
                <EventCard event={e} variant="glance" live={liveSlugs.includes(e.slug)} />
              </li>
            ))}
            {laterThisWeek.length > 24 && (
              <li className="px-1 pt-1 text-center">
                <Link
                  href="/events/calendar"
                  className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                >
                  {laterThisWeek.length - 24} more on the calendar &rarr;
                </Link>
              </li>
            )}
          </ol>
        </CollapsibleSection>
      )}

      {/* ── 6. BROWSE & SEARCH ALL EVENTS — the full explorer (search,
          lenses, map, calendar) as the power tool, COLLAPSED so it
          never opens as the lead. Everything above is the curated
          answer; this is "let me dig." */}
      <CollapsibleSection
        title="Browse & search all events"
        count={allEvents.length}
        countLabel="upcoming"
        storageKey="fr.events.browse"
        defaultOpen={false}
      >
        <EventsExplorer
          events={allEvents}
          liveSlugs={liveSlugs}
          categories={categories}
          towns={towns}
          nowISO={now.toISOString()}
          // next24ISO carries end-of-today (next Eastern midnight) so the
          // explorer's "Today" group matches the lead tier and never
          // includes tomorrow. (Prop name is historical, not a rolling +24h.)
          next24ISO={todayEnd.toISOString()}
          weekendStartISO={friday.toISOString()}
          weekendEndISO={monday.toISOString()}
          initialView={initialView}
          initialDay={initialDay}
        />
      </CollapsibleSection>

      {/* ── 6b. CIVIC MEETINGS — boards, commissions, hearings, council
          sessions classified out of the live feed. Present + findable in
          their own lane, never in "What's on". COLLAPSED, self-hides. */}
      {civicEvents.length > 0 && (
        <CollapsibleSection
          title="Civic meetings"
          count={civicEvents.length}
          countLabel={civicEvents.length === 1 ? "meeting" : "meetings"}
          storageKey="fr.events.civic-meetings"
          defaultOpen={false}
        >
          <ol className="space-y-2.5">
            {civicEvents.slice(0, 24).map((e) => (
              <li key={e.slug}>
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
          storageKey="fr.events.town-reminders"
          defaultOpen={false}
        >
          <ol className="space-y-2.5">
            {reminderEvents.slice(0, 24).map((e) => (
              <li key={e.slug}>
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
          storageKey="fr.events.official"
          defaultOpen={false}
        >
          <MunicipalEvents series={publicSeries} summary={ingestedSummary} />
        </CollapsibleSection>
      )}

      {/* ── 7. Honesty footer ───────────────────────────────────────── */}
      <footer
        className="space-y-1 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <p>
          Live event data pulled from Downtown Frederick Partnership,
          Celebrate Frederick, the Frederick County calendar, the Hood
          College Trumba feed, and Ticketmaster (music + Frederick Keys
          home games). Cached for one hour.
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

