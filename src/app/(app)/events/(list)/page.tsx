import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Moon, Music, Baby, Ticket, Palette, Trees, Building2 } from "lucide-react";
import { eventsLive, type EventWithMeta } from "@/lib/loaders/events";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { classifyEvent } from "@/lib/events/classify";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import { parseViewState, type ViewState } from "@/lib/view-state";
import EventsExplorer from "@/components/event/EventsExplorer";
import EventCard from "@/components/event/EventCard";
import WeekendVibes from "@/components/event/WeekendVibes";
import TonightRail from "@/components/event/TonightRail";
import EventWeekRibbon from "@/components/event/EventWeekRibbon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import MunicipalEvents from "@/components/event/MunicipalEvents";
import { getIngestedSeries, getIngestedSummary } from "@/lib/loaders/ingested";
import { itemListJsonLd } from "@/lib/seo/jsonld";
import PageBloom from "@/components/ui/PageBloom";
import IconStamp from "@/components/ui/IconStamp";
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
  // The raw "Event date: … Event Time: … Location:" feed dump is stripped at
  // the loader boundary now (cleanDescription in lib/events/normalize), so by
  // here `desc` is already clean — the old render-time regex guard is gone.
  // First sentence (up to the first ., ! or ?), else the whole thing.
  const m = desc.match(/^.*?[.!?](?=\s|$)/);
  let line = (m ? m[0] : desc).trim();
  // Guard against a runaway "sentence" (some feeds omit punctuation).
  if (line.length > 150) line = `${line.slice(0, 147).trimEnd()}…`;
  return line || undefined;
}

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
  const d = e.description;
  if (!d || d.length <= 160) return e;
  return { ...e, description: d.slice(0, 160) };
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

  // The unified set is assembled in lib/loaders/unifiedEvents, the SAME
  // function /today counts from, so the two surfaces can never disagree
  // about "this weekend" again. All sources inside it are fail-soft; the
  // civic ingest below keeps the same .catch guards. Feed failures must
  // never block or break /events.
  const [{ unified, publicEvents }, ingestedSeries, ingestedSummary] =
    await Promise.all([
      assembleUnifiedEvents(now),
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
    return lane !== "private_rental" && lane !== "cancelled";
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
  // Belt-and-suspenders hero guard: even within the public lane, the ONE
  // lead card for "What's worth going to?" should never be an internal /
  // members-only item that the classifier can't reasonably lane as civic
  // (luncheons, annual/board meetings, orientations, fundraiser breakfasts).
  // Skip those for the lead; fall back gracefully so the hero never goes
  // empty. (Review P0: the page led with a committee planning luncheon.)
  const HERO_INELIGIBLE =
    /\b(luncheon|annual\s+meeting|board\s+meeting|orientation|info(rmation)?\s+session|members?\s+only|fundraiser\s+(breakfast|luncheon)|staff\s+meeting|ribbon\s+cutting)\b/i;
  const upcoming = (e: EventWithMeta) => +new Date(e.starts_at) >= nowMs;
  const heroEvent: EventWithMeta | null =
    allEvents.find((e) => upcoming(e) && !HERO_INELIGIBLE.test(e.title ?? "")) ??
    allEvents.find(upcoming) ??
    allEvents[0] ??
    null;

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

  // ── Browse by mood — category slugs derived from the categories
  // actually present, so a mood tile never deep-links to an empty
  // filtered view (a mood with no match is simply omitted). Music /
  // family / arts / outdoors map to real event categories; Free and
  // Civic are handled separately (a free-only filter and the civic lane).
  const moodCats = (re: RegExp) =>
    categories.filter((c) => re.test(`${c.slug} ${c.name}`.toLowerCase())).map((c) => c.slug);
  const musicCats = moodCats(/music|concert|band|\bdj\b|orchestra|symphony/);
  const familyCats = moodCats(/family|kid|child|youth|story/);
  const artsCats = moodCats(/\bart|theat|museum|galler|craft|cultur|film|comedy|dance|exhibit/);
  const outdoorCats = moodCats(/outdoor|park|trail|hike|farm|market|festiv|nature|garden|run/);
  const moodTiles: { label: string; Icon: typeof Music; accent: string; href: string }[] = [
    ...(musicCats.length ? [{ label: "Live music", Icon: Music, accent: "#7E2C6F", href: `/events?cats=${musicCats.join(",")}` }] : []),
    ...(familyCats.length ? [{ label: "Family", Icon: Baby, accent: "#C99632", href: `/events?cats=${familyCats.join(",")}` }] : []),
    { label: "Free", Icon: Ticket, accent: "#1E6B3A", href: "/events?free=1" },
    ...(artsCats.length ? [{ label: "Arts", Icon: Palette, accent: "#7E2C6F", href: `/events?cats=${artsCats.join(",")}` }] : []),
    ...(outdoorCats.length ? [{ label: "Outdoors", Icon: Trees, accent: "#1E6B3A", href: `/events?cats=${outdoorCats.join(",")}` }] : []),
    // Civic only when the #civic-meetings anchor actually renders (same gate
    // as the section at line ~501), so on a thin civic day the tile can't
    // scroll-to-nothing like the gated Music/Family/Arts/Outdoors tiles.
    ...((civicEvents.length > 0 || reminderEvents.length > 0)
      ? [{ label: "Civic", Icon: Building2, accent: "#2F5470", href: "#civic-meetings" }]
      : []),
  ];

  // The Browse explorer opens automatically when arriving on a filtered
  // deep-link (a mood tile, free-only, or a day), so the filter is visible
  // instead of hidden inside a collapsed section.
  const browseOpen =
    (initialView.cats?.length ?? 0) > 0 || sp.get("free") === "1" || !!initialDay;

  // Structured data (June-9 audit P2): the listing as an ItemList of the
  // next public events, mirroring what the page renders.
  const eventsJsonLd = itemListJsonLd(
    "Events in Frederick County",
    allEvents.slice(0, 25).map((e) => ({ name: e.title, path: `/events/${e.slug}` })),
  );

  return (
    <div className="relative space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
      />
      <PageBloom variant="warm-cool" />

      {/* ── 1. HERO — compacted to a single tight line. The question +
          its hand-picked subline now sit on one row beside the Month-view
          pivot, trading the old two-line stack of air for a denser
          masthead so the week ribbon + lead card pull up the page. */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-serif text-[24px] font-semibold leading-[1.08] tracking-tight text-balance"
            style={{ color: "var(--app-ink)" }}
          >
            What&rsquo;s worth going to?
          </h1>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Live from county calendars and venue feeds.
          </p>
        </div>
        <Link
          href="/events/calendar"
          className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Month
        </Link>
      </header>

      {/* ── 2. BEST NEXT — the lead. One large editorial card for the
          soonest worthwhile event, carrying a real "why it matters" line.
          Always visible (not behind a collapsible), so the page opens on
          the answer, never on a calendar. */}
      {heroEvent && (
        <section aria-label="Next up" className="space-y-2">
          <header className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-[18px] w-[3px] rounded-full" style={{ background: "var(--app-brand)" }} />
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              {todayEvents.length === 0 ? "Next up" : "On tonight"}
            </h2>
          </header>
          <EventCard
            event={heroEvent}
            variant="feature"
            live={liveSlugs.includes(heroEvent.slug)}
            whyItMatters={whyItMatters(heroEvent)}
          />
        </section>
      )}

      {/* ── WEEK RIBBON — the density trick, BELOW the lead so "Next up"
          opens the page (never calendar-first). A slim whole-week row: seven
          frosted cells with weekday + numeral + live event count; tapping a
          day deep-links the explorer to ?d=YYYY-MM-DD. A jump-to-a-day
          navigator, not the lead. */}
      <EventWeekRibbon events={allEvents} activeDay={initialDay} />

      {/* ── 3. TONIGHT — only when there's actually something left today.
          A short photo-led marquee of what's starting soon, not the whole
          day's list. Self-hides on a quiet night. */}
      {todayEvents.length > 0 && highlightPool.length > 0 && (
        <section aria-label="Tonight" className="space-y-2.5">
          <header className="flex items-center gap-2">
            <Moon className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              More tonight
            </h2>
          </header>
          <TonightRail events={highlightPool} />
        </section>
      )}

      {/* ── 4. THIS WEEKEND — expanded, grouped by VIBE so the weekend
          reads by feel (music / food / family / arts / outdoors /
          civic), not as a flat chronological wall. */}
      {weekendEvents.length > 0 && (
        <CollapsibleSection
          title="This weekend"
          count={weekendEvents.length}
          countLabel={weekendEvents.length === 1 ? "event" : "events"}
          countAriaOnly
          storageKey="fr.events.weekend"
          defaultOpen
        >
          <WeekendVibes events={weekendEvents} liveSlugs={liveSlugs} />
        </CollapsibleSection>
      )}

      {/* ── 4b. BROWSE BY MOOD — a calm entry into the rest of the
          calendar by feel, not by date. Each tile deep-links a filtered
          view (and opens the explorer below); Civic jumps to the
          separated civic lane. Tiles with no matching events are omitted
          upstream, so a tap never lands on an empty list. */}
      <section aria-label="Browse by mood" className="space-y-2.5">
        <header className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-[18px] w-[3px] rounded-full" style={{ background: "var(--app-ink-3)" }} />
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Browse by mood
          </h2>
        </header>
        {/* Frosted/translucent fluid doorways — denser than the old solid
            tiles: a translucent accent-washed fill over backdrop-blur, a
            hairline edge + soft top highlight + a quiet lift, matching the
            Saved page's fluid-card grammar. 3-across with a tighter gap so
            more moods sit above the fold. The smaller IconStamp + inline
            label keep each tile shallow. */}
        <div className="grid grid-cols-3 gap-2">
          {moodTiles.map(({ label, Icon, accent, href }) => (
            <Link
              key={label}
              href={href}
              className="tactile tactile-interactive flex flex-col items-start gap-1.5 rounded-[var(--app-radius-lg)] p-2.5 backdrop-blur-md"
              style={{
                background: `linear-gradient(155deg, color-mix(in srgb, ${accent} 14%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 70%)`,
                boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
              }}
            >
              <IconStamp accent={accent} size="sm">
                <Icon aria-hidden />
              </IconStamp>
              <span className="text-[13px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 5. LATER THIS WEEK — the rest of the next 7 days, COLLAPSED
          ("Show N more"). Dense glance list; the long body of the week
          without crowding the lead tiers. */}
      {laterThisWeek.length > 0 && (
        <CollapsibleSection
          title="Later this week"
          count={laterThisWeek.length}
          countLabel={laterThisWeek.length === 1 ? "event" : "events"}
          countAriaOnly
          storageKey="fr.events.later"
          defaultOpen={false}
        >
          <ol className="space-y-2">
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
        defaultOpen={browseOpen}
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
          countAriaOnly
          storageKey="fr.events.town-reminders"
          defaultOpen={false}
        >
          <ol className="space-y-2">
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
          countAriaOnly
          storageKey="fr.events.official"
          defaultOpen={false}
        >
          <MunicipalEvents series={civicSeries} summary={ingestedSummary} />
        </CollapsibleSection>
      )}

      {/* ── 7. Honesty footer ───────────────────────────────────────── */}
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

