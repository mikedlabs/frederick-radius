"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, List as ListIcon, CalendarDays, Map as MapIcon, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import SectionHeading from "@/components/ui/SectionHeading";
import Sheet from "@/components/ui/Sheet";
import { groupByHorizon } from "@/lib/eventHorizon";
import { toQuery, type ViewState, type When } from "@/lib/view-state";
import type { EventWithMeta } from "@/lib/loaders/events";

type TimeKey = "all" | "today" | "weekend" | "week";

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
  const [time, setTime] = useState<TimeKey>(whenToTime(initialView?.when));
  const [town, setTown] = useState<string | null>(initialView?.municipality ?? null);
  const [day, setDay] = useState<string | null>(initialDay ?? null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "calendar" | "map">("list");
  // Presentation only (NOT ViewState/lens/deeplink): the facet panel is
  // collapsed by default so the page leads with events, not controls.
  const [showFilters, setShowFilters] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
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
      if (
        term &&
        !`${e.title} ${e.venue_name ?? ""} ${e.category_name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [events, day, time, cat, town, q, freeOnly, now, next24ISO, weekendStartISO, weekendEndISO]);

  // Group the filtered list into human horizons so the default view is
  // navigable at a glance instead of a 400-row chronological scroll.
  const horizonGroups = useMemo(
    () =>
      groupByHorizon(filtered, {
        now,
        next24: +new Date(next24ISO),
        weekendStart: +new Date(weekendStartISO),
        weekendEnd: +new Date(weekendEndISO),
        live,
      }),
    [filtered, now, next24ISO, weekendStartISO, weekendEndISO, live],
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
    cat !== null || town !== null || time !== "all" || q.trim() !== "" || freeOnly || day !== null;
  // Count only the panel facets (search is its own visible field).
  const filterCount = (cat !== null ? 1 : 0) + (town !== null ? 1 : 0) + (day ? 1 : 0);
  const clear = () => {
    setCat(null);
    setTown(null);
    setDay(null);
    setTime("all");
    setQ("");
    setFreeOnly(false);
  };

  // One-tap intent chips — what people actually open an events page
  // for. They drive the existing state; the deeper facets stay in the
  // Filters drawer so the main area leads with these, not controls.
  const QUICK: { key: string; label: string; on: boolean; toggle: () => void }[] = [
    { key: "tonight", label: "Tonight", on: time === "today", toggle: () => setTime(time === "today" ? "all" : "today") },
    { key: "weekend", label: "This weekend", on: time === "weekend", toggle: () => setTime(time === "weekend" ? "all" : "weekend") },
    { key: "music", label: "Live music", on: cat === "music", toggle: () => setCat(cat === "music" ? null : "music") },
    { key: "free", label: "Free", on: freeOnly, toggle: () => setFreeOnly((v) => !v) },
    { key: "family", label: "Family", on: cat === "family", toggle: () => setCat(cat === "family" ? null : "family") },
  ];

  return (
    <div className="space-y-3">
      {/* Quick intent — the lead affordance. One tap for what people
          actually want; deeper facets stay tucked in Filters. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {QUICK.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.toggle}
            aria-pressed={c.on}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition active:scale-[0.94] ${c.on ? "" : "tactile tactile-interactive"}`}
            style={{
              background: c.on
                ? "linear-gradient(135deg, var(--app-brand), color-mix(in srgb, var(--app-brand) 60%, var(--app-cool)))"
                : "var(--app-bg-elevated)",
              color: c.on ? "white" : "var(--app-ink-2)",
              boxShadow: c.on ? "var(--app-elev-2)" : undefined,
              transitionTimingFunction: "var(--app-ease-spring)",
            }}
          >
            {c.label}
          </button>
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
        <div
          className="tactile inline-flex shrink-0 overflow-hidden rounded-full"
          role="tablist"
          aria-label="View"
        >
          {(
            [
              ["list", ListIcon, "List"],
              ["calendar", CalendarDays, "Agenda"],
              ["map", MapIcon, "Map"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
              style={{
                background: view === key ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: view === key ? "white" : "var(--app-ink-2)",
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {label}
            </button>
          ))}
        </div>
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
        <span className="ml-auto text-xs" style={{ color: "var(--app-ink-3)" }}>
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
              <button
                type="button"
                onClick={() => setCat(null)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-[0.94] ${
                  cat === null ? "" : "tactile"
                }`}
                style={{
                  background: cat === null ? "var(--app-brand)" : "var(--app-bg-elevated)",
                  color: cat === null ? "white" : "var(--app-ink-2)",
                  transitionTimingFunction: "var(--app-ease-spring)",
                }}
              >
                All types
              </button>
              {categories.map((c) => {
                const on = cat === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setCat(on ? null : c.slug)}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-[0.94] ${
                      on ? "" : "tactile"
                    }`}
                    style={{
                      background: on ? "var(--app-brand)" : "var(--app-bg-elevated)",
                      color: on ? "white" : "var(--app-ink-2)",
                      transitionTimingFunction: "var(--app-ease-spring)",
                    }}
                  >
                    {c.name}
                  </button>
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
              <button
                type="button"
                onClick={() => setTown(null)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-[0.94] ${
                  town === null ? "" : "tactile"
                }`}
                style={{
                  background: town === null ? "var(--app-cool)" : "var(--app-bg-elevated)",
                  color: town === null ? "white" : "var(--app-ink-2)",
                  transitionTimingFunction: "var(--app-ease-spring)",
                }}
              >
                All towns
              </button>
              {towns.map((t) => {
                const on = town === t.slug;
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => setTown(on ? null : t.slug)}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-[0.94] ${
                      on ? "" : "tactile"
                    }`}
                    style={{
                      background: on ? "var(--app-cool)" : "var(--app-bg-elevated)",
                      color: on ? "white" : "var(--app-ink-2)",
                      transitionTimingFunction: "var(--app-ease-spring)",
                    }}
                  >
                    {t.name}
                  </button>
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
      ) : (
        // Grouped by human time horizon — "what's on now / today / this
        // weekend / later" — so the page is navigable at a glance, not
        // a 400-row chronological scroll. Each group shows a scannable
        // peek and expands in place; nothing is hidden.
        <div className="space-y-6">
          {horizonGroups.map((g, groupIdx) => {
            const isOpen = openGroups.has(g.key);
            const PEEK = 9;
            // Pull the first photo-backed event out of the FIRST group
            // as a feature card. One per page — gives the index a focal
            // point instead of a uniform stack of tiles.
            const featureIdx =
              groupIdx === 0 ? g.events.findIndex((e) => Boolean(e.hero_image)) : -1;
            const feature = featureIdx >= 0 ? g.events[featureIdx] : null;
            const rest = feature
              ? g.events.filter((_, i) => i !== featureIdx)
              : g.events;
            // Mobile-first scannability: the FIRST horizon group renders
            // as a horizontal swipeable shelf so users can graze without
            // a long vertical scroll. Following groups stay as a vertical
            // grid (the "browse" mode) — best of both. Hidden behind a
            // toggle (`isOpen`) where the user wants to see everything.
            const useShelf = groupIdx === 0 && !isOpen;
            const shown = isOpen ? rest : rest.slice(0, PEEK);
            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading
                  title={g.label}
                  count={g.events.length}
                  cta={rest.length > PEEK ? (isOpen ? "Show fewer" : "Show all") : undefined}
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
                {useShelf ? (
                  <div className="-mx-4 px-4">
                    <div className="shelf-rail stagger gap-3 pb-1">
                      {rest.slice(0, PEEK).map((e) => (
                        <div key={e.slug} className="relative w-[260px] shrink-0">
                          {live.has(e.slug) && (
                            <span
                              className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                              style={{ background: "var(--app-positive)" }}
                            >
                              <span className="live-dot" /> Live
                            </span>
                          )}
                          <EventCard event={e} variant="tile" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((e) => (
                      <div key={e.slug} className="relative">
                        {live.has(e.slug) && (
                          <span
                            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                            style={{ background: "var(--app-positive)" }}
                          >
                            <span className="live-dot" /> Live
                          </span>
                        )}
                        <EventCard event={e} variant="tile" />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
