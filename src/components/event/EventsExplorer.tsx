"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueryState, parseAsBoolean, parseAsStringEnum } from "nuqs";
import { CalendarDays, X, ChevronDown } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import EventsBoardDock, { type ViewKey, type EventSortKey } from "@/components/event/EventsBoardDock";
import SectionHeading from "@/components/ui/SectionHeading";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { isUtilityEvent } from "@/lib/event-kind";
import { groupByHorizon, isRangeListing } from "@/lib/eventHorizon";
import { eventIntentOf, countByIntent, eventDaypart, isForKids, isRecurringEvent, INTENT_BY_ID, type IntentId } from "@/lib/events/intents";
import { type Daypart } from "@/lib/daypart";
import { parseViewState, toQuery, type ViewState, type When } from "@/lib/view-state";
import type { EventWithMeta } from "@/lib/loaders/events";
import { pickLeadEvent } from "@/lib/events/lead-rank";
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
  events: EventWithMeta[];
  liveSlugs: string[];
  categories: { slug: string; name: string }[];
  towns: { slug: string; name: string }[];
  /** Server-computed boundaries (avoids client TZ math + hydration drift). */
  nowISO: string;
  next24ISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
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
  nowISO,
  next24ISO,
  weekendStartISO,
  weekendEndISO,
}: Props) {
  // Deep-link view (?cats/?m/?when + ?d), parsed CLIENT-side once at
  // mount. The /events page is a static (ISR) shell now — reading
  // searchParams server-side would opt the whole route out of static
  // rendering — and this component already client-renders behind a
  // Suspense boundary (nuqs reads useSearchParams), so the first thing
  // the user sees of the board is already the deep-linked view: no
  // default-view flash. The app-level template remounts this component
  // on every navigation, so mount-time parsing == navigation-time URL.
  const urlParams = useSearchParams();
  const [initial] = useState(() => {
    const sp = new URLSearchParams(urlParams.toString());
    const view: ViewState = parseViewState(sp);
    const d = sp.get("d");
    return { view, day: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null };
  });
  const [cat, setCat] = useState<string | null>(initial.view.cats?.[0] ?? null);
  // Lens (Now / Tonight / Weekend / This week / All) — URL-synced via
  // ?lens=foo so shared links restore the view, and the EventsCompartmented
  // "See all" deep-links land on the right tab. nuqs handles the param
  // codec (parseAsStringEnum) and rerenders on browser back/forward.
  // Default falls through to the mount-parsed ?when= so first paint
  // still matches the URL with no hydration flash.
  const [time, setTime] = useQueryState<TimeKey>(
    "lens",
    parseAsStringEnum<TimeKey>(["all", "today", "weekend", "week"])
      .withDefault(whenToTime(initial.view.when)),
  );
  const [town, setTown] = useState<string | null>(initial.view.municipality ?? null);
  // Intent + sub — the new category front door (EventsIntentRail). The
  // seven human intents roll up the ~25 place-categories; `sub` is a real
  // category slug shown as a second row when an intent has curated subs.
  // Both URL-synced (?intent / ?sub) so a "free music this weekend" view
  // is shareable. They compose as AND with the lens / town / free facets.
  const [intent, setIntent] = useQueryState<IntentId>(
    "intent",
    parseAsStringEnum<IntentId>(INTENT_IDS),
  );
  const [sub, setSub] = useQueryState("sub");
  // ?d=YYYY-MM-DD deep-link from the week ribbon / WeekStrip — restricts
  // the list to a single Eastern calendar day. Coexists with the
  // time-window filter (Tonight / Weekend / This week); the day wins
  // when both are set.
  const [day, setDay] = useState<string | null>(initial.day);
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewKey>("list");
  // Free-only toggle — URL-synced via ?free=1 so a filtered view is
  // shareable. Boolean codec maps 0/1 to false/true; default false so
  // an empty URL = no filter (no extra param on first load).
  const [freeOnly, setFreeOnly] = useQueryState(
    "free",
    parseAsBoolean.withDefault(false),
  );
  // Happy-hour-only toggle — URL-synced via ?happy=1. Predicate is a
  // title/venue regex (no formal "happy hour" category in the schema).
  // Added May 2026 in response to a competing iOS-only events app that
  // led with happy hours; this surfaces the same use case from a
  // broader product without bolting on a new event type.
  const [happyOnly, setHappyOnly] = useQueryState(
    "happy",
    parseAsBoolean.withDefault(false),
  );
  // ── Composable sub-facets (overhaul wave 3) — orthogonal to the intent
  // and to each other, each backed by a field that already exists on the
  // event and a pure predicate in lib/events/intents.ts. All URL-synced so
  // "free evening music for kids this weekend" is one shareable query.
  // Time of day (?tod=) — single Eastern daypart bucket via eventDaypart().
  const [tod, setTod] = useQueryState<Daypart>(
    "tod",
    parseAsStringEnum<Daypart>(DAYPART_KEYS),
  );
  // Kid-friendly (?kids=1) — audience includes kids-0-5 / kids-6-12.
  const [kidsOnly, setKidsOnly] = useQueryState("kids", parseAsBoolean.withDefault(false));
  // Recurring (?recurring=1) — repeats on a schedule (weekly series, etc.).
  const [recurringOnly, setRecurringOnly] = useQueryState(
    "recurring",
    parseAsBoolean.withDefault(false),
  );
  // Sort order (?sort=time|az|venue). "time" keeps the horizon
  // grouping ("Tonight / This weekend / This week / Later"); the
  // alphabetical and by-venue sorts drop the grouping and render
  // a flat list so the order the user picked is the order the user sees.
  const [sort, setSort] = useQueryState<EventSortKey>(
    "sort",
    parseAsStringEnum<EventSortKey>(["time", "az", "venue"]).withDefault("time"),
  );
  // Which horizon groups are expanded past their scannable peek.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const live = useMemo(() => new Set(liveSlugs), [liveSlugs]);
  const now = +new Date(nowISO);

  // Stage 1 — everything EXCEPT the category dimension (intent / sub /
  // exact cat). The intent rail's badges count against THIS set, so a
  // glance reads "how many music events match my current time + town +
  // free filters," not a static all-time tally.
  const baseFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((e) => {
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
  }, [events, day, time, town, q, freeOnly, happyOnly, tod, kidsOnly, recurringOnly, now, next24ISO, weekendStartISO, weekendEndISO]);

  // Rail badges — per-intent counts over the base set (post time/town/free,
  // pre intent/sub) so picking an intent doesn't zero out the other badges.
  const intentCounts = useMemo(() => countByIntent(baseFiltered), [baseFiltered]);

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
      municipality: town ?? undefined,
      when: timeToWhen(time),
    }),
    [cat, town, time],
  );

  // Mirror the structural view into the URL (deep-linkable, shareable).
  // Initial state is parsed from the URL at mount (see `initial` above),
  // so no hydrate effect is needed. history.replaceState, not router navigation:
  // filtering is fully client-side, so re-running the page's live-feed
  // loaders would be wasteful. Search text stays out of the URL by design.
  // Day filter rides along as ?d= so a tap on the WeekStrip survives a
  // share.
  useEffect(() => {
    // Merge the structural (server-readable) params INTO the existing URL
    // rather than replacing it. nuqs owns the client filter params
    // (?lens, ?free, ?happy, ?sort, ?q); replacing the whole query string
    // clobbered them — which reset the filter the instant a lens chip was
    // tapped (the URL-state race the audit caught). Start from the live
    // search string so nuqs's params survive.
    const sp = new URLSearchParams(window.location.search);
    const structural = new URLSearchParams(toQuery(viewState));
    for (const [k, v] of structural) sp.set(k, v);
    if (day) sp.set("d", day);
    else sp.delete("d");
    const full = sp.toString();
    const url = full ? `${window.location.pathname}?${full}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [viewState, day]);

  const anyFilter =
    cat !== null || intent !== null || sub !== null || town !== null ||
    time !== "all" || q.trim() !== "" || freeOnly || happyOnly ||
    tod !== null || kidsOnly || recurringOnly || day !== null;
  const clear = () => {
    setCat(null);
    setIntent(null);
    setSub(null);
    setTown(null);
    setDay(null);
    setTime("all");
    setQ("");
    setFreeOnly(false);
    setHappyOnly(false);
    setTod(null);
    setKidsOnly(false);
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
  if (recurringOnly) relaxations.push({ key: "recurring", label: "Recurring", drop: () => setRecurringOnly(false) });
  if (freeOnly) relaxations.push({ key: "free", label: "Free", drop: () => setFreeOnly(false) });
  if (happyOnly) relaxations.push({ key: "happy", label: "Happy hour", drop: () => setHappyOnly(false) });
  // Resolve the town name from the canonical municipality vocab, not just the
  // event-derived towns list — a town with zero matching events would
  // otherwise render as its raw slug ("burkittsville") in the zero state.
  if (town) relaxations.push({ key: "town", label: towns.find((t) => t.slug === town)?.name ?? MUNICIPALITY_BY_SLUG[town]?.name ?? town, drop: () => setTown(null) });
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
        events={events}
        filteredCount={filtered.length}
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
        setTown={setTown}
        q={q}
        setQ={setQ}
        freeOnly={freeOnly}
        setFreeOnly={setFreeOnly}
        happyOnly={happyOnly}
        setHappyOnly={setHappyOnly}
        kidsOnly={kidsOnly}
        setKidsOnly={setKidsOnly}
        recurringOnly={recurringOnly}
        setRecurringOnly={setRecurringOnly}
        anyFilter={anyFilter}
        clear={clear}
        view={view}
        setView={setView}
        sort={sort}
        setSort={setSort}
      />

      {/* Results */}
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
            // EDITORIAL lead, not raw chronology: the window's one big card
            // used to be whatever started soonest, so a toddler storytime
            // could headline over the Keys game or a festival five rows down
            // (the "feed dump vs a friend's shortlist" gap). pickLeadEvent
            // floats a real draw (then imagery, then soonest); the rest of
            // the window keeps its chronological order below.
            const lead = pickLeadEvent(g.events) ?? g.events[0];
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
            const rest = g.events.filter((e) => e !== lead);
            const shown = isOpen ? rest.slice(0, EXPANDED_CAP) : rest.slice(0, PEEK);
            const overflow = isOpen ? Math.max(0, rest.length - EXPANDED_CAP) : 0;
            const moreCount = rest.length - shown.length;
            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading title={g.label} count={g.events.length} />
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
                {rest.length > 0 && (
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
                    {rest.length > PEEK && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          aria-expanded={isOpen}
                          className="tactile tactile-interactive flex w-full items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border px-4 py-2.5 text-[13px] font-semibold"
                          style={{
                            borderColor: "var(--app-border)",
                            background: "var(--app-bg-elevated)",
                            color: "var(--app-cool)",
                          }}
                        >
                          {isOpen ? "Show fewer" : `Show ${moreCount} more`}
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
                              className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
                              style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
                            >
                              {overflow} more on the calendar →
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
              count={utilityFiltered.length}
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
              </ol>
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}
