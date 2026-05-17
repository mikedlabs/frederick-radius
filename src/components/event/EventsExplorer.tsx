"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, List as ListIcon, CalendarDays, Map as MapIcon, X, ChevronDown } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import EventAgenda from "@/components/event/EventAgenda";
import EventsMap from "@/components/event/EventsMap";
import SectionHeading from "@/components/ui/SectionHeading";
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
  weekendStartISO,
  weekendEndISO,
  initialView,
}: Props) {
  const [cat, setCat] = useState<string | null>(initialView?.cats?.[0] ?? null);
  const [time, setTime] = useState<TimeKey>(whenToTime(initialView?.when));
  const [town, setTown] = useState<string | null>(initialView?.municipality ?? null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "calendar" | "map">("list");
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
      if (time === "today" && !(t >= now && t < +new Date(next24ISO))) return false;
      if (
        time === "weekend" &&
        !(t >= +new Date(weekendStartISO) && t < +new Date(weekendEndISO))
      )
        return false;
      if (time === "week" && !(t >= now && t < now + 7 * 864e5)) return false;
      if (cat && e.category !== cat) return false;
      if (town && e.municipality !== town) return false;
      if (
        term &&
        !`${e.title} ${e.venue_name ?? ""} ${e.category_name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [events, time, cat, town, q, now, next24ISO, weekendStartISO, weekendEndISO]);

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

  const anyFilter = cat !== null || town !== null || time !== "all" || q.trim() !== "";
  const clear = () => {
    setCat(null);
    setTown(null);
    setTime("all");
    setQ("");
  };

  return (
    <div className="space-y-3">
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
            className="w-full rounded-full border py-2.5 pl-9 pr-3 text-sm"
            style={{
              background: "var(--app-bg-elevated)",
              borderColor: "var(--app-border)",
              color: "var(--app-ink)",
            }}
          />
        </div>
        <div
          className="inline-flex shrink-0 overflow-hidden rounded-full border"
          style={{ borderColor: "var(--app-border)" }}
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

      {/* Two compact dropdowns instead of two rows of chips. The time
          filter is gone — the horizon groups below ("Today & tonight",
          "This weekend"…) already organize by time, so a time filter
          on top of that was redundant noise. */}
      <div className="flex flex-wrap items-center gap-2">
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
            const PEEK = 6;
            const shown = isOpen ? g.events : g.events.slice(0, PEEK);
            return (
              <section key={g.key} className="space-y-3">
                <SectionHeading title={g.label} count={g.events.length} />
                <div className="grid grid-cols-2 gap-2.5">
                  {shown.map((e) => (
                    <div key={e.slug} className="relative">
                      {live.has(e.slug) && (
                        <span
                          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ background: "var(--app-positive)", color: "white" }}
                        >
                          ● Live
                        </span>
                      )}
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
