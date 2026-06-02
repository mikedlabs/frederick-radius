"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState, parseAsBoolean, parseAsStringEnum } from "nuqs";
import { Search, List as ListIcon, Rows3, CalendarDays, Map as MapIcon, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import SectionHeading from "@/components/ui/SectionHeading";
import Sheet from "@/components/ui/Sheet";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import Pill from "@/components/ui/Pill";
import Segmented, { type SegmentItem } from "@/components/ui/Segmented";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { isUtilityEvent } from "@/lib/event-kind";
import { groupByHorizon } from "@/lib/eventHorizon";
import { toQuery, type ViewState, type When } from "@/lib/view-state";
import type { EventWithMeta } from "@/lib/loaders/events";

type TimeKey = "all" | "today" | "weekend" | "week";
type EventSortKey = "time" | "az" | "venue";

// Editorial hierarchy by TYPE, not just time: the grouped list leads
// with draws (music, food, arts, family) and tucks civic business into a
// quiet tail. The draw/utility call is the app-wide rule in
// lib/event-kind.ts (taxonomy kind + a keyword net for mistagged feeds),
// so Today / events / map can never drift on what counts as "utility."

const EVENT_SORT_OPTIONS: ReadonlyArray<SortOption<EventSortKey>> = [
  { key: "time", label: "Soonest", hint: "Next event first (grouped by horizon)" },
  { key: "az", label: "A→Z", hint: "Alphabetical by event title" },
  { key: "venue", label: "Venue", hint: "Cluster by venue name" },
];

type ViewKey = "list" | "compact" | "calendar" | "map";

// The four lenses on the same filtered set. List = grouped browse;
// Compact = dense 48px "Rolodex" rows; Agenda = day-grouped schedule;
// Map = the pins. One Segmented control, labels collapse to icons on
// narrow screens.
const VIEW_ITEMS: ReadonlyArray<SegmentItem<ViewKey>> = [
  { key: "list", label: "List", icon: ListIcon },
  { key: "compact", label: "Compact", icon: Rows3 },
  { key: "calendar", label: "Agenda", icon: CalendarDays },
  { key: "map", label: "Map", icon: MapIcon },
];

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
  /** Deep-link view, parsed server-side so first paint matches the URL. */
  initialView?: ViewState;
  /** Optional ?d=YYYY-MM-DD deep-link from WeekStrip — restricts the
   *  list to a single Eastern calendar day. Coexists with the existing
   *  time-window filter (Tonight / Weekend / This week); the day wins
   *  when both are set. */
  initialDay?: string;
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

export default function EventsExplorer({
  events,
  liveSlugs,
  categories,
  towns,
  nowISO,
  next24ISO,
  weekendStartISO,
  weekendEndISO,
  initialView,
  initialDay,
}: Props) {
  const [cat, setCat] = useState<string | null>(initialView?.cats?.[0] ?? null);
  // Lens (Now / Tonight / Weekend / This week / All) — URL-synced via
  // ?lens=foo so shared links restore the view, and the EventsCompartmented
  // "See all" deep-links land on the right tab. nuqs handles the param
  // codec (parseAsStringEnum) and rerenders on browser back/forward.
  // Default falls through to the server-parsed initialView so first paint
  // still matches the URL with no hydration flash.
  const [time, setTime] = useQueryState<TimeKey>(
    "lens",
    parseAsStringEnum<TimeKey>(["all", "today", "weekend", "week"])
      .withDefault(whenToTime(initialView?.when)),
  );
  const [town, setTown] = useState<string | null>(initialView?.municipality ?? null);
  const [day, setDay] = useState<string | null>(initialDay ?? null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "compact" | "calendar" | "map">("list");
  // Presentation only (NOT ViewState/lens/deeplink): the facet panel is
  // collapsed by default so the page leads with events, not controls.
  const [showFilters, setShowFilters] = useState(false);
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

  // Apply user-chosen sort AFTER filtering. "time" preserves the
  // server-provided chronological order (and feeds the horizon
  // grouping below). The other keys produce a flat re-sort.
  const sortFn = useMemo(() => {
    switch (sort) {
      case "az":
        return (a: EventWithMeta, b: EventWithMeta) =>
          (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
      case "venue":
        return (a: EventWithMeta, b: EventWithMeta) => {
          const va = (a.venue_name ?? "").toLowerCase();
          const vb = (b.venue_name ?? "").toLowerCase();
          if (va !== vb) return va.localeCompare(vb);
          // Within a venue, fall back to chronological so a venue
          // cluster reads top-to-bottom as a venue schedule.
          return +new Date(a.starts_at) - +new Date(b.starts_at);
        };
      case "time":
      default:
        return (a: EventWithMeta, b: EventWithMeta) =>
          +new Date(a.starts_at) - +new Date(b.starts_at);
    }
  }, [sort]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((e) => {
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
      if (cat && e.category !== cat) return false;
      if (town && e.municipality !== town) return false;
      if (freeOnly && !e.is_free) return false;
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
    }).sort(sortFn);
  }, [events, day, time, cat, town, q, freeOnly, happyOnly, now, next24ISO, weekendStartISO, weekendEndISO, sortFn]);

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
  // Initial state is parsed server-side (initialView), so no hydrate
  // effect is needed. history.replaceState, not router navigation:
  // filtering is fully client-side, so re-running the page's live-feed
  // loaders would be wasteful. Search text stays out of the URL by design.
  // Day filter rides along as ?d= so a tap on the WeekStrip survives a
  // share.
  useEffect(() => {
    const qs = toQuery(viewState);
    const sp = new URLSearchParams(qs);
    if (day) sp.set("d", day);
    const full = sp.toString();
    const url = full ? `${window.location.pathname}?${full}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [viewState, day]);

  const anyFilter =
    cat !== null || town !== null || time !== "all" || q.trim() !== "" || freeOnly || happyOnly || day !== null;
  // Count only the panel facets (search is its own visible field).
  const filterCount = (cat !== null ? 1 : 0) + (town !== null ? 1 : 0) + (day ? 1 : 0);
  const clear = () => {
    setCat(null);
    setTown(null);
    setDay(null);
    setTime("all");
    setQ("");
    setFreeOnly(false);
    setHappyOnly(false);
  };

  // One-tap intent chips — what people actually open an events page
  // for. They drive the existing state; the deeper facets stay in the
  // Filters drawer so the main area leads with these, not controls.
  const QUICK: { key: string; label: string; on: boolean; toggle: () => void }[] = [
    { key: "tonight", label: "Tonight", on: time === "today", toggle: () => setTime(time === "today" ? "all" : "today") },
    { key: "weekend", label: "This weekend", on: time === "weekend", toggle: () => setTime(time === "weekend" ? "all" : "weekend") },
    { key: "music", label: "Live music", on: cat === "music", toggle: () => setCat(cat === "music" ? null : "music") },
    { key: "free", label: "Free", on: freeOnly, toggle: () => setFreeOnly((v) => !v) },
    { key: "happy", label: "Happy hour", on: happyOnly, toggle: () => setHappyOnly((v) => !v) },
    { key: "family", label: "Family", on: cat === "family", toggle: () => setCat(cat === "family" ? null : "family") },
    // Civic / meetings — separated per the May 2026 product review:
    // commission meetings, public hearings, and municipal agendas are
    // useful data but emotionally distinct from "dinner and music."
    // Surfacing this lane lets the user pull civic forward when they
    // want it AND keeps it from cluttering the default browse.
    { key: "civic", label: "Civic", on: cat === "civic", toggle: () => setCat(cat === "civic" ? null : "civic") },
  ];

  return (
    <div className="space-y-3">
      {/* Quick intent — the lead affordance. One tap for what people
          actually want; deeper facets stay tucked in Filters. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {QUICK.map((c) => (
          <Pill key={c.key} tone="prominent" active={c.on} onClick={c.toggle}>
            {c.label}
          </Pill>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events, venues…"
            aria-label="Search events"
            className="tactile w-full rounded-full py-2.5 pl-9 pr-3 text-sm"
            style={{
              background: "var(--app-bg-elevated)",
              color: "var(--app-ink)",
            }}
          />
        </div>
        {/* View toggle — labels collapse to icons on narrow screens so
            the row never crowds the search field. Compact "Rolodex"
            mode = 48px rows for density; Agenda + Map are the other two
            lenses on the same filtered set. */}
        <Segmented
          ariaLabel="View"
          labelsOn="sm"
          value={view}
          onChange={setView}
          items={VIEW_ITEMS}
        />
      </div>

      {/* One Filters button instead of an always-on facet wall, so the
          page leads with events. The facets (type/town) tuck into a
          panel. State / ViewState / lens / deeplink wiring is unchanged
          — this is purely how the controls are presented. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="evt-filter-panel"
          className="tactile inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition"
          style={{
            background:
              filterCount > 0
                ? "color-mix(in srgb, var(--app-brand) 14%, var(--app-bg-elevated))"
                : "var(--app-bg-elevated)",
            color: filterCount > 0 ? "var(--app-brand)" : "var(--app-ink-2)",
          }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Filters
          {filterCount > 0 && (
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: "var(--app-brand)" }}
            >
              {filterCount}
            </span>
          )}
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            strokeWidth={2.25}
            style={{ transform: showFilters ? "rotate(180deg)" : "none", color: "var(--app-ink-3)" }}
            aria-hidden
          />
        </button>
        <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
          {anyFilter && (
            <button
              type="button"
              onClick={clear}
              className="ml-2 inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--app-brand)" }}
            >
              <X className="h-3 w-3" aria-hidden /> Clear
            </button>
          )}
        </span>
        <SortDropdown
          className="ml-auto"
          options={EVENT_SORT_OPTIONS}
          value={sort}
          onChange={setSort}
        />
      </div>

      {/* Filters bottom sheet — same wiring, app-grade presentation.
          The deeper facets (type + town) live here so the page leads
          with events, not controls. */}
      <Sheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filter events"
        subtitle={
          filterCount > 0
            ? `${filterCount} active`
            : "Refine by type or town"
        }
        footer={
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                clear();
              }}
              className="text-[13px] font-semibold"
              style={{ color: "var(--app-ink-3)" }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="tactile tactile-interactive tactile-lift tactile-glow-brand rounded-full px-5 py-2 text-[13px] font-semibold text-white"
              style={{ backgroundColor: "var(--app-brand)" }}
            >
              Show {filtered.length} {filtered.length === 1 ? "event" : "events"}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Type */}
          <div>
            <h3
              className="eyebrow mb-2"
              style={{ color: "var(--app-ink-3)" }}
            >
              Type
            </h3>
            <div className="flex flex-wrap gap-2">
              <Pill tone="brand" size="sm" active={cat === null} onClick={() => setCat(null)}>
                All types
              </Pill>
              {categories.map((c) => {
                const on = cat === c.slug;
                return (
                  <Pill
                    key={c.slug}
                    tone="brand"
                    size="sm"
                    active={on}
                    onClick={() => setCat(on ? null : c.slug)}
                  >
                    {c.name}
                  </Pill>
                );
              })}
            </div>
          </div>
          {/* Town */}
          <div>
            <h3
              className="eyebrow mb-2"
              style={{ color: "var(--app-ink-3)" }}
            >
              Town
            </h3>
            <div className="flex flex-wrap gap-2">
              <Pill tone="cool" size="sm" active={town === null} onClick={() => setTown(null)}>
                All towns
              </Pill>
              {towns.map((t) => {
                const on = town === t.slug;
                return (
                  <Pill
                    key={t.slug}
                    tone="cool"
                    size="sm"
                    active={on}
                    onClick={() => setTown(on ? null : t.slug)}
                  >
                    {t.name}
                  </Pill>
                );
              })}
            </div>
          </div>
        </div>
      </Sheet>

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
            <li key={e.slug}>
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
            Nothing fits these filters.
          </h3>
          <p
            className="mx-auto mt-1 max-w-xs text-[13px] text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            Try a wider time window or fewer types. The list updates as
            soon as something matches.
          </p>
          {anyFilter && (
            <button
              type="button"
              onClick={clear}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold tactile tactile-interactive"
              style={{
                background: "var(--app-bg-elevated)",
                color: "var(--section-accent, var(--app-brand))",
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      ) : sort !== "time" ? (
        // User-driven sort (A→Z or by venue): drop the horizon
        // grouping so the order the user chose is the order they see.
        // Capped at 100 to keep the page snappy; the rest are reachable
        // by tightening filters or switching to the calendar/map view.
        <ul className="space-y-2">
          {filtered.slice(0, 100).map((e) => (
            <li key={e.slug}>
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
        <div className="space-y-6">
          {horizonGroups.map((g, groupIdx) => {
            const isOpen = openGroups.has(g.key);
            // One photo-backed FEATURE leads the first group as the
            // editorial focal point; everything else is a dense,
            // scannable listing (a printed-guide column, not a wall of
            // big tiles). Peek 8 rows, expand to 40 — rows are ~⅕ a tile
            // so a fuller peek no longer reads as endless.
            const PEEK = 8;
            const EXPANDED_CAP = 40;
            const featureIdx =
              groupIdx === 0 ? g.events.findIndex((e) => Boolean(e.hero_image)) : -1;
            const feature = featureIdx >= 0 ? g.events[featureIdx] : null;
            const rest = feature
              ? g.events.filter((_, i) => i !== featureIdx)
              : g.events;
            const shown = isOpen
              ? rest.slice(0, EXPANDED_CAP)
              : rest.slice(0, PEEK);
            const overflow = isOpen ? Math.max(0, rest.length - EXPANDED_CAP) : 0;
            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading
                  title={g.label}
                  count={g.events.length}
                  cta={rest.length > PEEK ? (isOpen ? "Show fewer" : `Show all ${rest.length}`) : undefined}
                  onCtaClick={
                    rest.length > PEEK ? () => toggleGroup(g.key) : undefined
                  }
                />
                {feature && (
                  <div className="relative">
                    {live.has(feature.slug) && (
                      <span
                        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ background: "var(--app-positive)" }}
                      >
                        <span className="live-dot" /> Live
                      </span>
                    )}
                    <EventCard event={feature} variant="feature" />
                  </div>
                )}
                {/* Glance cards — each row carries a thumbnail (the venue's
                    borrowed photo, or a category graphic when there's no
                    photo) so the list scans as cards, not a wall of text.
                    The ultra-dense "Compact" Rolodex is still one tap away
                    via the view toggle for people who want max density. */}
                {shown.length > 0 && (
                  <ol className="space-y-2.5">
                    {shown.map((e) => (
                      <li key={e.slug}>
                        <EventCard event={e} variant="glance" live={live.has(e.slug)} />
                      </li>
                    ))}
                  </ol>
                )}
                {/* Overflow nudge — point the long tail at the calendar
                    instead of dumping every remaining row inline. */}
                {overflow > 0 && (
                  <div className="px-1 pt-1 text-center">
                    <Link
                      href="/events/calendar"
                      className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-4 py-2 text-[12px] font-semibold transition hover:bg-[var(--app-bg-sunken)]"
                      style={{
                        borderColor: "var(--app-border)",
                        color: "var(--app-cool)",
                      }}
                    >
                      {overflow} more on the calendar →
                    </Link>
                  </div>
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
                  <li key={e.slug}>
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
