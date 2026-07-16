"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronDown, X } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import EventsBoardDock, { type ViewKey, type EventSortKey } from "@/components/event/EventsBoardDock";
import SectionHeading from "@/components/ui/SectionHeading";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { isUtilityEvent } from "@/lib/event-kind";
import { groupByHorizon, isRangeListing } from "@/lib/eventHorizon";
import type { EventBrowseSummary } from "@/lib/events/browsePayload";
import { eventIntentOf, countByIntent, eventDaypart, isForKids, isRecurringEvent, INTENT_BY_ID, type IntentId } from "@/lib/events/intents";
import { isLgbtqEvent } from "@/lib/events/lgbtq";
import { type Daypart } from "@/lib/daypart";
import { parseViewState, toQuery, type ViewState, type When } from "@/lib/view-state";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventSourceHealth } from "@/lib/loaders/unifiedEvents";
import { getEventsTown, setEventsTown } from "@/lib/personalize";
import {
  getScope,
  parseScope,
  scopeToParam,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  SCOPE_PARAM,
  type Scope,
} from "@/lib/scope";
import { isEventEnded } from "@/lib/eventWhenLabel";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

type TimeKey = "all" | "today" | "weekend" | "week";

// The eight intent ids, for the ?intent= URL codec. Mirrors IntentId in
// lib/events/intents.ts (civic included — it's tucked in the rail, not
// absent from the taxonomy, and a shared link to it must still restore).
const INTENT_IDS: IntentId[] = [
  "music", "arts", "food", "family", "sports", "outdoors", "community", "civic",
];

// Time-of-day facet — the four Eastern dayparts (shared with /today's
// reorder spine), surfaced here as a composable filter (?tod=). Single
// label per bucket so the chip reads plainly.
const DAYPARTS: Array<{ key: Daypart; label: string }> = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "late", label: "Late" },
];
const DAYPART_KEYS: Daypart[] = DAYPARTS.map((d) => d.key);

// Editorial hierarchy by TYPE, not just time: the grouped list leads
// with draws (music, food, arts, family) and tucks civic business into a
// quiet tail. The draw/utility call is the app-wide rule in
// lib/event-kind.ts (taxonomy kind + a keyword net for mistagged feeds),
// so Today / events / map can never drift on what counts as "utility."

// The view lens (List / Compact / Agenda / Map) and sort options now live
// in the masthead-dock (EventsBoardDock) — how you look at the filtered
// set, kept visually apart from the filter caption. ViewKey / EventSortKey
// are imported from there so both surfaces speak one vocabulary.

type Props = {
  /** Bounded, server-rendered preview. The full collection loads on intent. */
  events: EventWithMeta[];
  liveSlugs: string[];
  categories: { slug: string; name: string }[];
  towns: { slug: string; name: string }[];
  summary: EventBrowseSummary;
  sourceHealth: EventSourceHealth;
  /** Server-computed boundaries (avoids client TZ math + hydration drift). */
  nowISO: string;
  next24ISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
};

type BrowseResponse = {
  events: EventWithMeta[];
  liveSlugs: string[];
  generatedAt: string;
  sourceHealth?: EventSourceHealth;
};

// Facet <-> shared ViewState. Search text is intentionally excluded: a
// lens is a structural view, not an ephemeral query, and the confirmed
// ViewState shape has no free-text field. "all" and the forward-compat
// "upcoming" both mean "no time constraint" here.
const timeToWhen = (t: TimeKey): When | undefined =>
  t === "all" ? undefined : t;
const whenToTime = (w?: When): TimeKey =>
  w === "today" || w === "weekend" || w === "week" ? w : "all";

// One-off Eastern-day key (YYYY-MM-DD) for the day filter. Mirrors
// the helper in WeekStrip so the explorer matches its tile keys.
function dayKeyEastern(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Chronological sort key. An IN-PROGRESS date-range listing (isRangeListing —
// an exhibit, a series a feed flattened to one long window) sorts by its
// CLOSING date, not its months-old starts_at anchor: "through Jul 5" sits
// beside July 5's dated events (closing-soonest is the honest urgency)
// instead of a 2022 first-day anchor dragging it to the top of every list.
function chronoKey(e: EventWithMeta, nowISO: string): number {
  const t = +new Date(e.starts_at);
  return isRangeListing(e) && t <= Date.parse(nowISO) ? +new Date(e.ends_at) : t;
}

export default function EventsExplorer({
  events,
  liveSlugs,
  categories,
  towns,
  summary,
  sourceHealth,
  nowISO,
  next24ISO,
  weekendStartISO,
  weekendEndISO,
}: Props) {
  // The server renders this bounded preview. The full compact corpus is kept
  // out of React Flight and fetched only after explicit browsing intent.
  const [eventPool, setEventPool] = useState(events);
  const [currentLiveSlugs, setCurrentLiveSlugs] = useState(liveSlugs);
  const [dataComplete, setDataComplete] = useState(events.length >= summary.totalCount);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);

  // Server-safe defaults let this Client Component emit useful static HTML.
  // URL and device preferences are applied after hydration, then mirrored
  // without using router query hooks (which would CSR-bail the whole board).
  const [urlReady, setUrlReady] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [time, setTime] = useState<TimeKey>("all");
  const [town, setTown] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<Scope | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [currentSourceHealth, setCurrentSourceHealth] = useState(sourceHealth);
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewKey>("list");
  const [freeOnly, setFreeOnly] = useState(false);
  // Happy-hour-only toggle — URL-synced via ?happy=1. Predicate is a
  // title/venue regex (no formal "happy hour" category in the schema).
  // Added May 2026 in response to a competing iOS-only events app that
  // led with happy hours; this surfaces the same use case from a
  // broader product without bolting on a new event type.
  const [happyOnly, setHappyOnly] = useState(false);
  // ── Composable sub-facets (overhaul wave 3) — orthogonal to the intent
  // and to each other, each backed by a field that already exists on the
  // event and a pure predicate in lib/events/intents.ts. All URL-synced so
  // "free evening music for kids this weekend" is one shareable query.
  // Time of day (?tod=) — single Eastern daypart bucket via eventDaypart().
  const [tod, setTod] = useState<Daypart | null>(null);
  // Kid-friendly (?kids=1) — audience includes kids-0-5 / kids-6-12.
  const [kidsOnly, setKidsOnly] = useState(false);
  // LGBTQ+ community (?lgbtq=1) — isLgbtqEvent: conservative title match
  // (Pride/queer/drag-performance contexts) or a verified community venue
  // (The Frederick Center). Same composable-facet contract as the rest.
  const [lgbtqOnly, setLgbtqOnly] = useState(false);
  // Recurring (?recurring=1) — repeats on a schedule (weekly series, etc.).
  const [recurringOnly, setRecurringOnly] = useState(false);
  // Sort order (?sort=time|az|venue). "time" keeps the horizon
  // grouping ("Tonight / This weekend / This week / Later"); the
  // alphabetical and by-venue sorts drop the grouping and render
  // a flat list so the order the user picked is the order the user sees.
  const [sort, setSort] = useState<EventSortKey>("time");

  const applyBrowserState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseViewState(params);
    const lens = params.get("lens");
    const intentParam = params.get("intent");
    const todParam = params.get("tod");
    const sortParam = params.get("sort");
    const dayParam = params.get("d");
    const bool = (key: string) => {
      const value = params.get(key)?.toLowerCase();
      return value === "true" || value === "1";
    };

    setCat(parsed.cats?.[0] ?? null);
    setTime(
      lens === "all" || lens === "today" || lens === "weekend" || lens === "week"
        ? lens
        : whenToTime(parsed.when),
    );
    // Canonical ?in= wins, then legacy ?m= (upgraded on the next URL write),
    // then the shared scope. A remembered Events-only town is the final
    // backwards-compatible fallback. Crucially, explicit near-me/county
    // scopes clear the remembered town instead of silently pinning it.
    const explicitScope = parseScope(params.get(SCOPE_PARAM));
    const legacyTown = parsed.municipality && MUNICIPALITY_BY_SLUG[parsed.municipality]
      ? parsed.municipality
      : null;
    const storedScope = getScope();
    const remembered = getEventsTown();
    const resolvedScope = explicitScope
      ?? (legacyTown ? `town:${legacyTown}` as Scope : null)
      ?? storedScope
      ?? (remembered && MUNICIPALITY_BY_SLUG[remembered]
        ? `town:${remembered}` as Scope
        : null);
    setActiveScope(resolvedScope);
    setTown(scopeTownSlug(resolvedScope));
    if (explicitScope || legacyTown) setScope(resolvedScope);
    setIntent(INTENT_IDS.includes(intentParam as IntentId) ? intentParam as IntentId : null);
    setSub(params.get("sub"));
    setDay(dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null);
    setFreeOnly(bool("free"));
    setHappyOnly(bool("happy"));
    setTod(DAYPART_KEYS.includes(todParam as Daypart) ? todParam as Daypart : null);
    setKidsOnly(bool("kids"));
    setLgbtqOnly(bool("lgbtq"));
    setRecurringOnly(bool("recurring"));
    setSort(sortParam === "az" || sortParam === "venue" ? sortParam : "time");
  }, []);

  useEffect(() => {
    let active = true;
    // Run after the hydrated default paint. This preserves useful static HTML
    // and avoids a synchronous effect cascade while still applying deep links
    // before a person can meaningfully interact.
    queueMicrotask(() => {
      if (!active) return;
      applyBrowserState();
      setUrlReady(true);
    });
    window.addEventListener("popstate", applyBrowserState);
    const unsubscribeScope = subscribeScopeChange((nextScope) => {
      setActiveScope(nextScope);
      setTown(scopeTownSlug(nextScope));
    });
    return () => {
      active = false;
      window.removeEventListener("popstate", applyBrowserState);
      unsubscribeScope();
    };
  }, [applyBrowserState]);

  const chooseTown = useCallback((nextTown: string | null) => {
    const nextScope: Scope = nextTown ? `town:${nextTown}` : "county";
    setActiveScope(nextScope);
    setTown(nextTown);
    setScope(nextScope);
  }, []);

  useEffect(() => {
    if (urlReady) setEventsTown(town);
  }, [town, urlReady]);

  const ensureAllEvents = useCallback((): Promise<void> => {
    if (dataComplete) return Promise.resolve();
    if (requestRef.current) return requestRef.current;

    setLoadingAll(true);
    setLoadError(null);
    const request = fetch("/api/events/browse", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Events request failed (${response.status})`);
        const payload = await response.json() as BrowseResponse;
        if (!Array.isArray(payload.events)) throw new Error("Events response was incomplete");
        setEventPool(payload.events);
        setCurrentLiveSlugs(payload.liveSlugs);
        if (payload.sourceHealth) setCurrentSourceHealth(payload.sourceHealth);
        setDataComplete(true);
      })
      .catch(() => {
        setLoadError("Couldn’t load the rest of the calendar. Try again.");
      })
      .finally(() => {
        requestRef.current = null;
        setLoadingAll(false);
      });
    requestRef.current = request;
    return request;
  }, [dataComplete]);

  // Which horizon groups are expanded past their scannable peek.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) => {
    if (!openGroups.has(k) && !dataComplete) void ensureAllEvents();
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const live = useMemo(() => new Set(currentLiveSlugs), [currentLiveSlugs]);
  const now = +new Date(nowISO);
  const anyFilter =
    cat !== null || intent !== null || sub !== null || town !== null ||
    time !== "all" || q.trim() !== "" || freeOnly || happyOnly ||
    tod !== null || kidsOnly || lgbtqOnly || recurringOnly || day !== null;

  // Stage 1 — everything EXCEPT the category dimension (intent / sub /
  // exact cat). The intent rail's badges count against THIS set, so a
  // glance reads "how many music events match my current time + town +
  // free filters," not a static all-time tally.
  const baseFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return eventPool.filter((e) => {
      // FINISHED events never render, on ANY path. The horizon grouping
      // already dropped them, but the flat paths — the week ribbon's ?d= day
      // view, search results, the A-Z/venue sorts — filtered by start-day
      // only, so tapping "today" at 11 PM listed the whole day's ended
      // events as if they were still worth your time. One gate here covers
      // every mode. (All-day events run to the end of their Eastern day.)
      if (isEventEnded(e, new Date(now))) return false;
      // Day filter wins over time-window filters when both are set.
      if (day && dayKeyEastern(e.starts_at) !== day) return false;
      const t = +new Date(e.starts_at);
      if (!day && time === "today" && !(t >= now && t < +new Date(next24ISO))) return false;
      if (
        !day && time === "weekend" &&
        !(t >= +new Date(weekendStartISO) && t < +new Date(weekendEndISO))
      )
        return false;
      if (!day && time === "week" && !(t >= now && t < now + 7 * 864e5)) return false;
      if (town && e.municipality !== town) return false;
      if (freeOnly && !e.is_free) return false;
      if (tod && eventDaypart(e) !== tod) return false;
      if (kidsOnly && !isForKids(e)) return false;
      if (lgbtqOnly && !isLgbtqEvent(e)) return false;
      if (recurringOnly && !isRecurringEvent(e)) return false;
      if (happyOnly) {
        // Match against title + venue + description so we catch both
        // event-level happy hours ("Tuesday happy hour at X") and the
        // venue-level recurring lineups some publishers tag this way.
        const hay = `${e.title} ${e.venue_name ?? ""} ${e.description ?? ""}`;
        if (!/\bhappy\s*hour\b/i.test(hay)) return false;
      }
      if (
        term &&
        !`${e.title} ${e.venue_name ?? ""} ${e.category_name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [eventPool, day, time, town, q, freeOnly, happyOnly, tod, kidsOnly, lgbtqOnly, recurringOnly, now, next24ISO, weekendStartISO, weekendEndISO]);

  // Rail badges — per-intent counts over the base set (post time/town/free,
  // pre intent/sub) so picking an intent doesn't zero out the other badges.
  const intentCounts = useMemo(
    () => !dataComplete && !anyFilter ? summary.intentCounts : countByIntent(baseFiltered),
    [anyFilter, baseFiltered, dataComplete, summary.intentCounts],
  );

  // Stage 2 — the category dimension (intent roll-up + sub + the legacy
  // exact-cat from the Type drawer / deep-links), then the chosen sort.
  // "time" preserves the server-provided chronological order (and feeds
  // the horizon grouping below); the other keys produce a flat re-sort.
  const filtered = useMemo(() => {
    const sortFn = (a: EventWithMeta, b: EventWithMeta): number => {
      if (sort === "az")
        return (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
      if (sort === "venue") {
        const va = (a.venue_name ?? "").toLowerCase();
        const vb = (b.venue_name ?? "").toLowerCase();
        // Within a venue, fall through to chronological so a venue
        // cluster reads top-to-bottom as a venue schedule.
        if (va !== vb) return va.localeCompare(vb);
      }
      return chronoKey(a, nowISO) - chronoKey(b, nowISO);
    };
    return baseFiltered
      .filter((e) => {
        if (intent && eventIntentOf(e) !== intent) return false;
        if (sub && e.category !== sub) return false;
        if (cat && e.category !== cat) return false;
        return true;
      })
      .sort(sortFn);
  }, [baseFiltered, intent, sub, cat, sort, nowISO]);

  // Split the filtered set by TYPE so the grouped list leads with what
  // people actually come for; civic business sinks into a quiet tail
  // below (still one tap away). Only the default "list" view splits —
  // the Compact / Calendar / Map lenses keep the full set, since those
  // are deliberate "show me everything" modes.
  const crowdFiltered = useMemo(
    () => filtered.filter((e) => !isUtilityEvent(e)),
    [filtered],
  );
  const utilityFiltered = useMemo(
    () => filtered.filter((e) => isUtilityEvent(e)),
    [filtered],
  );

  // Group the CROWD list into human horizons so the default view is
  // navigable at a glance instead of a 400-row chronological scroll.
  const horizonGroups = useMemo(
    () =>
      groupByHorizon(crowdFiltered, {
        now,
        next24: +new Date(next24ISO),
        weekendStart: +new Date(weekendStartISO),
        weekendEnd: +new Date(weekendEndISO),
        live,
      }),
    [crowdFiltered, now, next24ISO, weekendStartISO, weekendEndISO, live],
  );

  const mapPins = useMemo(
    () =>
      filtered.map((e) => ({
        slug: e.slug,
        title: e.title,
        geom: e.geom,
        category: e.category,
        venue_name: e.venue_name,
      })),
    [filtered],
  );

  const viewState = useMemo<ViewState>(
    () => ({
      cats: cat ? [cat] : undefined,
      when: timeToWhen(time),
    }),
    [cat, time],
  );

  // Mirror the complete shareable filter state into the URL. This uses the
  // History API directly so the page remains a static, server-rendered route;
  // browser back/forward is restored by applyBrowserState's popstate listener.
  // Search text and the visual mode stay local by design.
  useEffect(() => {
    if (!urlReady) return;
    const sp = new URLSearchParams(window.location.search);
    for (const key of [
      "cats", "m", SCOPE_PARAM, "when", "d", "lens", "tod", "intent", "sub",
      "free", "happy", "kids", "lgbtq", "recurring", "sort",
    ]) sp.delete(key);
    const structural = new URLSearchParams(toQuery(viewState));
    for (const [k, v] of structural) sp.set(k, v);
    if (activeScope) sp.set(SCOPE_PARAM, scopeToParam(activeScope));
    if (day) sp.set("d", day);
    if (time !== "all") sp.set("lens", time);
    if (tod) sp.set("tod", tod);
    if (intent) sp.set("intent", intent);
    if (sub) sp.set("sub", sub);
    if (freeOnly) sp.set("free", "true");
    if (happyOnly) sp.set("happy", "true");
    if (kidsOnly) sp.set("kids", "true");
    if (lgbtqOnly) sp.set("lgbtq", "true");
    if (recurringOnly) sp.set("recurring", "true");
    if (sort !== "time") sp.set("sort", sort);
    const full = sp.toString();
    const url = full ? `${window.location.pathname}?${full}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [viewState, activeScope, day, time, tod, intent, sub, freeOnly, happyOnly, kidsOnly, lgbtqOnly, recurringOnly, sort, urlReady]);

  // The bounded preview is sufficient for the default list. Every operation
  // that promises a complete answer promotes the cached continuation exactly
  // once. Fetch is deduplicated by requestRef.
  useEffect(() => {
    if (!urlReady || dataComplete) return;
    if (anyFilter || view !== "list" || sort !== "time" || openGroups.size > 0) {
      queueMicrotask(() => void ensureAllEvents());
    }
  }, [anyFilter, dataComplete, ensureAllEvents, openGroups, sort, urlReady, view]);

  const clear = () => {
    setCat(null);
    setIntent(null);
    setSub(null);
    chooseTown(null);
    setDay(null);
    setTime("all");
    setQ("");
    setFreeOnly(false);
    setHappyOnly(false);
    setTod(null);
    setKidsOnly(false);
    setLgbtqOnly(false);
    setRecurringOnly(false);
  };

  // Active facets as one-tap "drop this" relaxations — the honest empty
  // state names exactly what's narrowing the list and lets the user widen
  // one constraint at a time instead of a blunt "Clear all". Built in the
  // order a user is most likely to want to relax (the sharpest filters
  // first). Labels resolve to the human name, not the raw slug.
  const relaxations: { key: string; label: string; drop: () => void }[] = [];
  if (intent) relaxations.push({ key: "intent", label: INTENT_BY_ID[intent].label, drop: () => { setIntent(null); setSub(null); } });
  if (sub) relaxations.push({ key: "sub", label: categories.find((c) => c.slug === sub)?.name ?? sub, drop: () => setSub(null) });
  if (cat) relaxations.push({ key: "cat", label: categories.find((c) => c.slug === cat)?.name ?? cat, drop: () => setCat(null) });
  if (tod) relaxations.push({ key: "tod", label: DAYPARTS.find((d) => d.key === tod)?.label ?? tod, drop: () => setTod(null) });
  if (kidsOnly) relaxations.push({ key: "kids", label: "Kid-friendly", drop: () => setKidsOnly(false) });
  if (lgbtqOnly) relaxations.push({ key: "lgbtq", label: "LGBTQ+", drop: () => setLgbtqOnly(false) });
  if (recurringOnly) relaxations.push({ key: "recurring", label: "Recurring", drop: () => setRecurringOnly(false) });
  if (freeOnly) relaxations.push({ key: "free", label: "Free", drop: () => setFreeOnly(false) });
  if (happyOnly) relaxations.push({ key: "happy", label: "Happy hour", drop: () => setHappyOnly(false) });
  // Resolve the town name from the canonical municipality vocab, not just the
  // event-derived towns list — a town with zero matching events would
  // otherwise render as its raw slug ("burkittsville") in the zero state.
  if (town) relaxations.push({ key: "town", label: towns.find((t) => t.slug === town)?.name ?? MUNICIPALITY_BY_SLUG[town]?.name ?? town, drop: () => chooseTown(null) });
  if (time !== "all") relaxations.push({ key: "time", label: time === "today" ? "Today" : time === "weekend" ? "This weekend" : "This week", drop: () => setTime("all") });
  if (day) relaxations.push({ key: "day", label: "That day", drop: () => setDay(null) });

  return (
    <div className="space-y-3">
      {/* The masthead-dock — the almanac nameplate (collapses on scroll) +
          the pinned What · When · Where caption bar (each word a tab into a
          top-sheet pane) + the mono count line and the "how you look"
          controls (view lens + sort). It REPLACES the old five stacked
          rows (intent rail + quick pills + search + view toggle + Filters
          button/sheet). Every filter param and the results engine below
          are untouched: the dock is pure control chrome over this
          component's state. Saved events live on /my-radius now, so there's
          no saved rail above the first event — the board leads with events. */}
      <EventsBoardDock
        nowISO={nowISO}
        dayCounts={summary.dayCounts}
        filteredCount={!dataComplete && !anyFilter ? summary.totalCount : filtered.length}
        intentCounts={intentCounts}
        categories={categories}
        towns={towns}
        intent={intent}
        setIntent={setIntent}
        sub={sub}
        setSub={setSub}
        cat={cat}
        setCat={setCat}
        lens={time}
        setLens={setTime}
        tod={tod}
        setTod={setTod}
        day={day}
        setDay={setDay}
        town={town}
        setTown={chooseTown}
        q={q}
        setQ={setQ}
        freeOnly={freeOnly}
        setFreeOnly={setFreeOnly}
        happyOnly={happyOnly}
        setHappyOnly={setHappyOnly}
        kidsOnly={kidsOnly}
        setKidsOnly={setKidsOnly}
        lgbtqOnly={lgbtqOnly}
        setLgbtqOnly={setLgbtqOnly}
        recurringOnly={recurringOnly}
        setRecurringOnly={setRecurringOnly}
        anyFilter={anyFilter}
        clear={clear}
        view={view}
        setView={setView}
        sort={sort}
        setSort={setSort}
      />

      {currentSourceHealth.degraded && (
        <p
          role="status"
          className="rounded-[var(--app-radius-md)] border px-3 py-2 text-[12px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--app-warning) 35%, var(--app-border))",
            background: "color-mix(in srgb, var(--app-warning) 7%, var(--app-bg-elevated))",
            color: "var(--app-ink-2)",
          }}
        >
          Some live calendars didn&rsquo;t answer. This board is showing the events that loaded successfully.
        </p>
      )}

      {loadingAll && (
        <p
          role="status"
          className="rounded-[var(--app-radius-md)] px-3 py-2 text-center text-[12px]"
          style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}
        >
          Loading the complete calendar…
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void ensureAllEvents()}
            className="tap-44-y shrink-0 font-semibold underline"
            style={{ color: "var(--app-cool)" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      <div aria-busy={loadingAll} className="space-y-3">
      {view === "calendar" ? (
        <EventAgenda events={filtered} nowMs={now} />
      ) : view === "map" ? (
        <EventsMap events={mapPins} />
      ) : view === "compact" && filtered.length > 0 ? (
        // Compact "Rolodex" mode — flat list of 48px rows, no horizon
        // grouping, no feature card. Capped at 200 since each row is
        // ~⅕ the height of a feature card. The user is here for
        // density, not browsing.
        <ol
          className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] [&_>_li:last-child_article]:border-b-0"
          style={{
            borderColor: "var(--app-border)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          {filtered.slice(0, 200).map((e) => (
            <li key={`${e.slug}-${e.starts_at}`}>
              <EventCard event={e} variant="compact" />
            </li>
          ))}
          {filtered.length > 200 && (
            <li
              className="px-3 py-3 text-center text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Showing the first 200. Tighten filters or switch to the calendar view for the long tail.
            </li>
          )}
        </ol>
      ) : filtered.length === 0 ? (
        // Composed empty state — soft category-tinted block, serif line,
        // one quiet sentence, primary action. Replaces the bare bordered
        // text-only message.
        <div
          className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] px-6 py-10 text-center"
          style={{
            background:
              "radial-gradient(80% 60% at 30% 20%, color-mix(in srgb, var(--section-accent, var(--app-brand)) 14%, var(--app-bg-elevated)), var(--app-bg-elevated))",
          }}
        >
          <span
            aria-hidden
            className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--section-accent, var(--app-brand)) 22%, var(--app-bg-elevated))",
              color: "var(--section-accent, var(--app-brand))",
            }}
          >
            <CalendarDays className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <h3
            className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Nothing fits these filters
          </h3>
          <p
            className="mx-auto mt-1 max-w-xs text-[13px] text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            {relaxations.length > 0
              ? "Drop a filter to widen the search. The list updates the moment something matches."
              : "Try a wider time window or fewer types. The list updates as soon as something matches."}
          </p>
          {/* Honest relaxations — name each active filter and let the user
              widen ONE at a time, sharpest first. Beats a blunt "Clear all"
              when only one constraint is the culprit. */}
          {relaxations.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {relaxations.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={r.drop}
                  className="tap-44-y inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold tactile tactile-interactive"
                  style={{
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink-2)",
                    boxShadow: "inset 0 0 0 1px var(--app-border)",
                  }}
                >
                  <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  {r.label}
                </button>
              ))}
              {relaxations.length > 1 && (
                <button
                  type="button"
                  onClick={clear}
                  className="tap-44-y inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold tactile tactile-interactive"
                  style={{ background: "var(--app-bg-elevated)", color: "var(--section-accent, var(--app-brand))" }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      ) : sort !== "time" ? (
        // User-driven sort (A→Z or by venue): drop the horizon
        // grouping so the order the user chose is the order they see.
        // Capped at 100 to keep the page snappy; the rest are reachable
        // by tightening filters or switching to the calendar/map view.
        // grid-cols-1 (minmax(0,1fr)) clamps the mobile track to the container
        // — a bare `grid` leaves an auto track that a card with a wide
        // min-content (one long unbroken token) stretches past the page edge
        // (397px track in a 358px column, Jul-9 mobile audit).
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {filtered.slice(0, 100).map((e) => (
            <li key={`${e.slug}-${e.starts_at}`}>
              <EventCard event={e} />
            </li>
          ))}
          {filtered.length > 100 && (
            <li
              className="pt-2 text-center text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Showing the first 100. Use filters or the calendar view to narrow further.
            </li>
          )}
        </ul>
      ) : (
        // Grouped by human time horizon — "what's on now / today / this
        // weekend / later" — so the page is navigable at a glance, not
        // a 400-row chronological scroll. Each group shows a scannable
        // peek and expands in place; nothing is hidden.
        <div className="space-y-4">
          {horizonGroups.map((g, groupIdx) => {
            const isOpen = openGroups.has(g.key);
            // ONE lead per horizon — the next thing in this window — as the
            // MAIN card; the rest of the window stays collapsed behind a
            // "Show N more" drop-down, so each timeframe reads as a single
            // answer you expand on demand (stronger hierarchy than a flat
            // peek of eight). Group 0's lead is the photo-capable feature;
            // the others lead with their first event as a glance card.
            const EXPANDED_CAP = 40;
            // Paint a scannable PEEK of each window by default, not just the
            // lead. The page assembles hundreds of events but the old
            // lead-only first paint surfaced ~one card per window, so the body
            // read as nearly empty against the header count (the "653 events,
            // but I only see a handful" gap). A peek of five behind the lead
            // makes every window legible at a glance; "Show N more" still
            // reveals the long tail on demand.
            const PEEK = 5;
            // "Soonest" is a literal contract: the first card and every row
            // beneath it must stay chronological. Editorial promotion belongs
            // in a separately named Recommended view, never inside this sort.
            const lead = g.events[0];
            // Feature (photo) treatment for a group's lead ONLY when a real
            // venue photo exists — one photograph per horizon window down
            // the browse spine (image audit: the page read as a wall of text
            // because exactly one card could ever carry a large photo).
            // Photoless leads keep the glance row, INCLUDING the first
            // group's: the old `groupIdx === 0 ||` escape hatch put a tall
            // empty glyph plate at the very top of the page whenever the
            // first lead had no photo (beta trust audit 2026-07-08). An
            // oversized plate is ornament, not information — the photo
            // policy's "photoless leads keep the glance row" rule now holds
            // everywhere (EventCard also enforces it at the card seam).
            const leadIsFeature = Boolean(lead.hero_image);
            const rest = g.events.slice(1);
            const groupCount = !dataComplete && !anyFilter
              ? summary.horizonCounts[g.key]
              : g.events.length;
            const totalRest = Math.max(0, groupCount - 1);
            const shown = isOpen ? rest.slice(0, EXPANDED_CAP) : rest.slice(0, PEEK);
            const overflow = isOpen && dataComplete ? Math.max(0, totalRest - EXPANDED_CAP) : 0;
            const moreCount = Math.max(0, totalRest - shown.length);
            const canExpand = totalRest > PEEK;
            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading title={g.label} count={groupCount} />
                {/* The ONE lead — the main thing in this window. */}
                <div className="relative">
                  {live.has(lead.slug) && (
                    <span
                      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                      style={{ background: "var(--app-positive)" }}
                    >
                      <span className="live-dot" /> Live
                    </span>
                  )}
                  <EventCard
                    event={lead}
                    variant={leadIsFeature ? "feature" : "glance"}
                    live={live.has(lead.slug)}
                    // Only the first group's hero is the LCP candidate; the
                    // later per-group photo leads lazy-load.
                    priorityImage={groupIdx === 0}
                  />
                </div>
                {/* Drop-down — the rest of this window, one tap away. The
                    revealed cards animate in (reveal-up); the chevron flips. */}
                {totalRest > 0 && (
                  <>
                    {shown.length > 0 && (
                      // grid-cols-1: clamp the peek track (see the sorted
                      // list above) so no card can widen it past the page.
                      <ol className="reveal-up grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                        {shown.map((e) => (
                          <li key={`${e.slug}-${e.starts_at}`}>
                            <EventCard event={e} variant="glance" live={live.has(e.slug)} />
                          </li>
                        ))}
                      </ol>
                    )}
                    {/* Only when the window holds MORE than the default peek —
                        otherwise the peek already shows everything. */}
                    {canExpand && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isOpen && !dataComplete) void ensureAllEvents();
                            else toggleGroup(g.key);
                          }}
                          aria-expanded={isOpen}
                          disabled={isOpen && loadingAll}
                          className="tactile tactile-interactive flex w-full items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border px-4 py-2.5 text-[13px] font-semibold"
                          style={{
                            borderColor: "var(--app-border)",
                            background: "var(--app-bg-elevated)",
                            color: "var(--app-cool)",
                          }}
                        >
                          {isOpen && !dataComplete
                            ? loadingAll
                              ? "Loading more…"
                              : "Try loading more"
                            : isOpen
                              ? "Show fewer"
                              : `Show ${moreCount} more`}
                          <ChevronDown
                            className="h-4 w-4 transition-transform"
                            strokeWidth={2.25}
                            style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                            aria-hidden
                          />
                        </button>
                        {overflow > 0 && (
                          <div className="px-1 pt-1 text-center">
                            <Link
                              href="/events/calendar"
                              className="tap-44 inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
                              style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                            >
                              {overflow} more on the calendar <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
                            </Link>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </section>
            );
          })}

          {/* ── Civic & meetings — the utility tail. Council / NAC /
              commission business, kept OUT of the main flow (it's not
              what most people come for) but one tap away for the people
              who want it. Sits just above the page's "Official calendars"
              municipal-series block, so all the civic-utility weight
              lives together at the bottom. */}
          {utilityFiltered.length > 0 && (
            <CollapsibleSection
              title="Civic & meetings"
              count={!dataComplete && !anyFilter ? summary.utilityCount : utilityFiltered.length}
              storageKey="fr.events.civic"
              defaultOpen={false}
            >
              <ol
                className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] [&_>_li:last-child_article]:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                {utilityFiltered.slice(0, 80).map((e) => (
                  <li key={`${e.slug}-${e.starts_at}`}>
                    <EventCard event={e} variant="compact" />
                  </li>
                ))}
                {!dataComplete && summary.utilityCount > utilityFiltered.length && (
                  <li className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => void ensureAllEvents()}
                      className="tap-44-y px-3 text-[12px] font-semibold underline"
                      style={{ color: "var(--app-cool)" }}
                    >
                      Load all {summary.utilityCount} civic events
                    </button>
                  </li>
                )}
              </ol>
            </CollapsibleSection>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
