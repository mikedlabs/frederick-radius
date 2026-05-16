"use client";

import { useMemo, useState } from "react";
import { Search, List as ListIcon, CalendarDays, Map as MapIcon, X } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import MonthGrid from "@/components/event/MonthGrid";
import EventsMap from "@/components/event/EventsMap";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { CalEvent } from "@/lib/loaders/calendar";

// Inlined (pure, no deps) so this client component does not pull the
// server-only calendar loader (drizzle/postgres) into the bundle.
function nyDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
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
  weekendStartISO: string;
  weekendEndISO: string;
};

const nyMonth = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(iso))
    .slice(0, 7);

function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  const [cat, setCat] = useState<string | null>(null);
  const [time, setTime] = useState<TimeKey>("all");
  const [town, setTown] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "calendar" | "map">("list");
  const [month, setMonth] = useState(() => nyMonth(nowISO));

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

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of filtered) {
      const key = nyDayKey(e.starts_at);
      (m[key] = m[key] ?? []).push({
        id: e.slug,
        title: e.title,
        startUtc: e.starts_at,
        allDay: e.is_all_day ?? false,
        municipality: e.municipality,
        category: e.category ?? null,
        href: `/events/${e.slug}`,
        source: "seed",
      });
    }
    return m;
  }, [filtered]);

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

  const anyFilter = cat !== null || town !== null || time !== "all" || q.trim() !== "";
  const clear = () => {
    setCat(null);
    setTown(null);
    setTime("all");
    setQ("");
  };

  const chip = (active: boolean) =>
    ({
      background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
      color: active ? "white" : "var(--app-ink-2)",
      border: `1px solid ${active ? "var(--app-brand)" : "var(--app-border)"}`,
    }) as const;

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
              ["calendar", CalendarDays, "Calendar"],
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

      {/* Time + category + town chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {(
          [
            ["all", "All"],
            ["today", "Today"],
            ["weekend", "This weekend"],
            ["week", "This week"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTime(key)}
            className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
            style={chip(time === key)}
          >
            {label}
          </button>
        ))}
        <span
          aria-hidden
          className="mx-1 h-5 w-px shrink-0 self-center"
          style={{ background: "var(--app-border)" }}
        />
        <button
          type="button"
          onClick={() => setCat(null)}
          className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
          style={chip(cat === null)}
        >
          All types
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setCat(cat === c.slug ? null : c.slug)}
            className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
            style={chip(cat === c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <select
          value={town ?? ""}
          onChange={(e) => setTown(e.target.value || null)}
          aria-label="Filter by town"
          className="rounded-full border px-3 py-2 text-xs font-semibold"
          style={{
            background: "var(--app-bg-elevated)",
            borderColor: "var(--app-border)",
            color: "var(--app-ink-2)",
          }}
        >
          <option value="">All towns</option>
          {towns.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
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
      </div>

      {/* Results */}
      {view === "calendar" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth((mm) => addMonth(mm, -1))}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              onClick={() => setMonth((mm) => addMonth(mm, 1))}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", border: "1px solid var(--app-border)" }}
            >
              Next ›
            </button>
          </div>
          <MonthGrid month={month} byDay={byDay} total={filtered.length} />
        </div>
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
        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={e.slug} className="relative">
              {live.has(e.slug) && (
                <span
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "var(--app-positive)", color: "white" }}
                >
                  ● Live now
                </span>
              )}
              <EventCard event={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
