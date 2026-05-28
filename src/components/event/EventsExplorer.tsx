"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  List as ListIcon,
  CalendarDays,
  Map as MapIcon,
  X,
  ChevronDown,
  SlidersHorizontal,
  Music,
  Palette,
  Apple,
  Baby,
  Trees,
  Utensils,
  Theater,
  Activity,
  ShoppingBag,
} from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import SpotlightHero from "@/components/event/SpotlightHero";
import SectionHeading from "@/components/ui/SectionHeading";
import { groupByHorizon } from "@/lib/eventHorizon";
import { toQuery, type ViewState, type When } from "@/lib/view-state";
import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";

function CategoryIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  switch (name) {
    case "Music":
      return <Music className={className} style={style} />;
    case "Palette":
      return <Palette className={className} style={style} />;
    case "Apple":
      return <Apple className={className} style={style} />;
    case "Baby":
      return <Baby className={className} style={style} />;
    case "Trees":
      return <Trees className={className} style={style} />;
    case "Utensils":
      return <Utensils className={className} style={style} />;
    case "Theater":
      return <Theater className={className} style={style} />;
    case "Activity":
      return <Activity className={className} style={style} />;
    case "ShoppingBag":
      return <ShoppingBag className={className} style={style} />;
    default:
      return <CalendarDays className={className} style={style} />;
  }
}

type TimeKey = "all" | "today" | "weekend" | "week";

type Props = {
  events: EventWithMeta[];
  liveSlugs: string[];
  categories: { slug: string; name: string }[];
  towns: { slug: string; name: string }[];
  /** Server-computed boundaries (avoids client TZ math + hydration drift). */
  nowISO: string;
  next24ISO: string;
  tonightStartISO: string;
  tonightEndISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
  /** Deep-link view, parsed server-side so first paint matches the URL. */
  initialView?: ViewState;
};

// Facet <-> shared ViewState. Search text is intentionally excluded: a
// lens is a structural view, not an ephemeral query, and the confirmed
// ViewState shape has no free-text field. "all" and the forward-compat
// "upcoming" both mean "no time constraint" here.
const timeToWhen = (t: TimeKey): When | undefined =>
  t === "all" ? undefined : t;
const whenToTime = (w?: When): TimeKey =>
  w === "today" || w === "weekend" || w === "week" ? w : "all";

export default function EventsExplorer({
  events,
  liveSlugs,
  categories,
  towns,
  nowISO,
  next24ISO,
  tonightStartISO,
  tonightEndISO,
  weekendStartISO,
  weekendEndISO,
  initialView,
}: Props) {
  const [cat, setCat] = useState<string | null>(initialView?.cats?.[0] ?? null);
  const [time, setTime] = useState<TimeKey>(whenToTime(initialView?.when));
  const [town, setTown] = useState<string | null>(initialView?.municipality ?? null);
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
      const t = +new Date(e.starts_at);
      if (time === "today") {
        const start = +new Date(tonightStartISO);
        const end = +new Date(tonightEndISO);
        if (!(t >= start && t < end)) {
          const endsAt = +new Date(e.ends_at);
          if (!(endsAt > start && t <= start)) {
            return false;
          }
        }
      }
      if (
        time === "weekend" &&
        !(t >= +new Date(weekendStartISO) && t < +new Date(weekendEndISO))
      )
        return false;
      if (time === "week" && !(t >= now && t < now + 7 * 864e5)) return false;
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
  }, [events, time, cat, town, q, freeOnly, now, tonightStartISO, tonightEndISO, weekendStartISO, weekendEndISO]);

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
  useEffect(() => {
    const qs = toQuery(viewState);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [viewState]);

  const anyFilter =
    cat !== null || town !== null || time !== "all" || q.trim() !== "" || freeOnly;
  // Count only the panel facets (search is its own visible field).
  const filterCount = (cat !== null ? 1 : 0) + (town !== null ? 1 : 0);
  const clear = () => {
    setCat(null);
    setTown(null);
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
    { key: "free", label: "Free", on: freeOnly, toggle: () => setFreeOnly((v) => !v) },
  ];

  return (
    <div className="space-y-6">
      {/* Spotlight Hero Carousel - Flagship focal point at the top */}
      {!anyFilter && view === "list" && (
        <div className="stagger-item">
          <SpotlightHero events={events} />
        </div>
      )}

      {/* Visual Category Exploration Rail */}
      <div className="stagger-item">
        <div className="-mx-4 px-4 overflow-x-auto flex gap-5 pb-3 scrollbar-none" role="group" aria-label="Explore by category">
          {categories.map((c) => {
            const isSelected = cat === c.slug;
            const catData = CATEGORY_BY_SLUG[c.slug];
            const accentColor = catData?.color ?? "var(--app-brand)";
            const iconName = catData?.icon ?? "CalendarDays";

            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCat(isSelected ? null : c.slug)}
                className="flex flex-col items-center gap-1.5 shrink-0 select-none outline-none group cursor-pointer"
                aria-pressed={isSelected}
              >
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center border transition-all duration-300 relative shadow-[var(--app-shadow-1)] hover:scale-105 active:scale-95"
                  style={{
                    background: isSelected
                      ? `color-mix(in srgb, ${accentColor} 12%, var(--app-bg-elevated))`
                      : "var(--app-bg-elevated)",
                    borderColor: isSelected ? accentColor : "var(--app-border)",
                    boxShadow: isSelected ? `0 0 12px 0 color-mix(in srgb, ${accentColor} 20%, transparent)` : undefined,
                  }}
                >
                  <CategoryIcon
                    name={iconName}
                    className="h-[22px] w-[22px] transition-transform duration-300 group-hover:scale-110"
                    style={{ color: isSelected ? accentColor : "var(--app-ink-3)" }}
                  />
                </div>
                <span
                  className="text-[10px] font-bold tracking-wider uppercase text-center max-w-[70px] truncate"
                  style={{ color: isSelected ? "var(--app-ink)" : "var(--app-ink-2)" }}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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

      {showFilters && (
        <div
          id="evt-filter-panel"
          className="tactile flex flex-wrap items-center gap-2 rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] p-2.5"
        >
          <div className="relative">
            <label htmlFor="evt-cat" className="sr-only">Filter by type</label>
            <select
              id="evt-cat"
              value={cat ?? ""}
              onChange={(e) => setCat(e.target.value || null)}
              className="appearance-none rounded-full border bg-[var(--app-bg-elevated)] py-2 pl-3.5 pr-8 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </div>
          <div className="relative">
            <label htmlFor="evt-town" className="sr-only">Filter by town</label>
            <select
              id="evt-town"
              value={town ?? ""}
              onChange={(e) => setTown(e.target.value || null)}
              className="appearance-none rounded-full border bg-[var(--app-bg-elevated)] py-2 pl-3.5 pr-8 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              <option value="">All towns</option>
              {towns.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </div>
        </div>
      )}

      {/* Results */}
      {view === "calendar" ? (
        <EventAgenda events={filtered} nowMs={now} />
      ) : view === "map" ? (
        <EventsMap events={mapPins} />
      ) : filtered.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No events match these filters yet.
          {anyFilter && (
            <button type="button" onClick={clear} className="ml-1 font-semibold" style={{ color: "var(--app-brand)" }}>
              Clear filters
            </button>
          )}
        </p>
      ) : (
        // Grouped by human time horizon — "what's on now / today / this
        // weekend / later" — so the page is navigable at a glance, not
        // a 400-row chronological scroll. Each group shows a scannable
        // peek and expands in place; nothing is hidden.
        <div className="space-y-6">
          {horizonGroups.map((g) => {
            const isOpen = openGroups.has(g.key);
            const PEEK = 9;
            const shown = isOpen ? g.events : g.events.slice(0, PEEK);

            // Immediate horizon groups are "Live now" (live) and "Today" (today).
            // Under default view (no filter active) and when showing list view,
            // render them as a horizontal scrolling shelf-rail.
            const isImmediate = g.key === "live" || g.key === "today";
            const renderAsShelf = !anyFilter && view === "list" && isImmediate;

            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading title={g.label} count={g.events.length} />
                {renderAsShelf ? (
                  <div className="-mx-4 px-4">
                    <div className="shelf-rail gap-4 pb-2">
                      {g.events.map((e) => (
                        <div key={e.slug} className="w-[280px] shrink-0">
                          <EventCard event={e} variant="tile" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {shown.map((e) => (
                        <div key={e.slug} className="relative">
                          <EventCard event={e} variant="tile" />
                        </div>
                      ))}
                    </div>
                    {g.events.length > PEEK && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition active:opacity-70"
                        style={{ color: "var(--app-brand)" }}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        {isOpen
                          ? "Show fewer"
                          : `Show all ${g.events.length} · ${g.label.toLowerCase()}`}
                      </button>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
