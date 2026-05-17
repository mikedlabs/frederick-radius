"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, PlusCircle, Compass } from "lucide-react";
import EventCard from "@/components/event/EventCard";
import type { EventWithMeta, TownEvents } from "@/lib/loaders/events";

/**
 * Equity-by-design events view. Every one of the twelve municipalities
 * gets an equal-weight section regardless of how many events it has, so a
 * town with one event is featured as deliberately as the county seat. The
 * layout is never proportional to event volume. An "Around the county"
 * row guarantees small-town representation so Frederick never crowds the
 * rest of the county out. Filtering is instant and client side; the URL
 * stays deep-linkable without a reload.
 */

type WhenKey = "all" | "today" | "weekend" | "later";

const WHEN_TABS: Array<{ key: WhenKey; label: string }> = [
  { key: "all", label: "All upcoming" },
  { key: "today", label: "Today" },
  { key: "weekend", label: "This weekend" },
  { key: "later", label: "Later" },
];

function normalizeWhen(v: string | undefined): WhenKey {
  return v === "today" || v === "weekend" || v === "later" ? v : "all";
}

export default function EventsByTown({
  towns,
  aroundCounty,
  initialTown,
  initialWhen,
  nowISO,
  next24hISO,
  weekendStartISO,
  weekendEndISO,
}: {
  towns: TownEvents[];
  aroundCounty: EventWithMeta[];
  initialTown?: string;
  initialWhen?: string;
  nowISO: string;
  next24hISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
}) {
  const knownTown = towns.some((t) => t.municipality.slug === initialTown)
    ? initialTown
    : undefined;
  const [selectedTown, setSelectedTown] = useState<string | undefined>(knownTown);
  const [when, setWhen] = useState<WhenKey>(normalizeWhen(initialWhen));

  const bounds = useMemo(
    () => ({
      now: +new Date(nowISO),
      next24h: +new Date(next24hISO),
      weekendStart: +new Date(weekendStartISO),
      weekendEnd: +new Date(weekendEndISO),
    }),
    [nowISO, next24hISO, weekendStartISO, weekendEndISO],
  );

  const inWhen = useCallback(
    (e: EventWithMeta): boolean => {
      if (when === "all") return true;
      const s = +new Date(e.starts_at);
      if (when === "today") return s >= bounds.now && s < bounds.next24h;
      if (when === "weekend")
        return s >= bounds.weekendStart && s < bounds.weekendEnd;
      return s >= bounds.weekendEnd;
    },
    [when, bounds],
  );

  const syncUrl = useCallback((town: string | undefined, w: WhenKey) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", "town");
    if (town) params.set("m", town);
    else params.delete("m");
    if (w !== "all") params.set("when", w);
    else params.delete("when");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, []);

  const pickTown = (slug: string | undefined) => {
    const next = slug === selectedTown ? undefined : slug;
    setSelectedTown(next);
    syncUrl(next, when);
    if (next) {
      const el = document.getElementById(`town-${next}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const pickWhen = (w: WhenKey) => {
    setWhen(w);
    syncUrl(selectedTown, w);
  };

  const visibleTowns = selectedTown
    ? towns.filter((t) => t.municipality.slug === selectedTown)
    : towns;

  const countFor = (t: TownEvents) => t.events.filter(inWhen).length;
  const aroundFiltered = aroundCounty.filter(inWhen);

  return (
    <div className="space-y-5">
      {/* When control */}
      <div
        role="tablist"
        aria-label="When"
        className="flex flex-wrap gap-1.5"
      >
        {WHEN_TABS.map((t) => {
          const active = t.key === when;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => pickWhen(t.key)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-[0.97]"
              style={{
                background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: active ? "white" : "var(--app-ink-2)",
                borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                minHeight: 40,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Town chips — wrapped, all visible */}
      <div>
        <ul className="flex flex-wrap gap-2">
          <li>
            <button
              onClick={() => pickTown(undefined)}
              aria-pressed={!selectedTown}
              className="rounded-full border px-3 py-1.5 text-xs font-medium tracking-tight transition-colors"
              style={{
                background: !selectedTown ? "var(--app-ink)" : "var(--app-bg-elevated)",
                color: !selectedTown ? "white" : "var(--app-ink-2)",
                borderColor: !selectedTown ? "var(--app-ink)" : "var(--app-border)",
              }}
            >
              All towns
            </button>
          </li>
          {towns.map((t) => {
            const active = t.municipality.slug === selectedTown;
            const n = countFor(t);
            return (
              <li key={t.municipality.slug}>
                <button
                  onClick={() => pickTown(t.municipality.slug)}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium tracking-tight transition-colors"
                  style={{
                    background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                    color: active ? "white" : "var(--app-ink-2)",
                    borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                  }}
                >
                  {t.municipality.name}
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                    style={{
                      background: active ? "rgba(255,255,255,0.25)" : "var(--app-bg-sunken)",
                      color: active ? "white" : "var(--app-ink-3)",
                    }}
                  >
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Around the county: one upcoming event per non-Frederick town */}
      {!selectedTown && aroundFiltered.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2
              className="inline-flex items-center gap-2 font-serif text-xl font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              <Compass className="h-4 w-4" strokeWidth={1.75} style={{ color: "var(--app-accent)" }} aria-hidden />
              Around the county
            </h2>
            <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>
              One event from each town
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
            Every town outside Frederick gets a place here, so the smaller calendars are never buried.
          </p>
          <ul className="space-y-2">
            {aroundFiltered.map((e) => (
              <li key={e.slug}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Equity grid: every town, equal weight */}
      <div className="space-y-7">
        {visibleTowns.map((t) => {
          const events = t.events.filter(inWhen);
          const nearby = t.nearby.filter(inWhen);
          return (
            <section
              key={t.municipality.slug}
              id={`town-${t.municipality.slug}`}
              className="scroll-mt-28 space-y-3"
            >
              <header
                className="sticky top-14 z-20 -mx-4 flex items-baseline justify-between gap-3 border-b px-4 py-2"
                style={{
                  borderColor: "var(--app-border)",
                  background: "color-mix(in srgb, var(--app-bg) 92%, transparent)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="min-w-0">
                  <h2
                    className="truncate font-serif text-xl font-semibold tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {t.municipality.name}
                  </h2>
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.1em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {t.municipality.type} · pop. {t.municipality.population.toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/m/${t.municipality.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tracking-tight"
                  style={{ color: "var(--app-cool)" }}
                >
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t.municipality.name} page
                </Link>
              </header>

              {events.length > 0 ? (
                <ul className="space-y-2">
                  {events.map((e) => (
                    <li key={e.slug}>
                      <EventCard event={e} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="space-y-4 rounded-[var(--app-radius-lg)] border border-dashed p-4"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium" style={{ color: "var(--app-ink-2)" }}>
                      No events are on the calendar for {t.municipality.name} in this window yet.
                    </p>
                    <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
                      {t.municipality.name} runs on community word of mouth. If you know
                      something happening here, it belongs on this page.
                    </p>
                  </div>
                  <Link
                    href={`/submit/event?m=${t.municipality.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--app-shadow-1)]"
                    style={{ background: "var(--app-brand)" }}
                  >
                    <PlusCircle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    Submit an event for {t.municipality.name}
                  </Link>

                  {nearby.length > 0 && (
                    <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                      <p
                        className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Happening near {t.municipality.name}
                      </p>
                      <ul className="space-y-2">
                        {nearby.map((e) => (
                          <li key={e.slug}>
                            <EventCard event={e} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
