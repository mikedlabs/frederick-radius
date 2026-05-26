"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { formatEventTime } from "@/lib/format/eventTime";
import type { CalEvent } from "@/lib/loaders/calendar";

const WD = ["S", "M", "T", "W", "T", "F", "S"];

// Municipality → accent so the grid reads at a glance.
function muniColor(m: string): string {
  const s = m.toLowerCase();
  if (s.includes("frederick county")) return "var(--app-cool)";
  if (s.includes("frederick")) return "var(--app-brand)";
  if (s.includes("thurmont")) return "var(--app-positive)";
  if (s.includes("mount airy")) return "#7E2C6F";
  if (s.includes("walkersville")) return "var(--app-accent)";
  return "var(--app-ink-3)";
}

/** Map a day's event count to a single density signal — size + brand
 *  tint when the day is busy. Reads cleaner than the old "up to 3 muni
 *  dots + +N" cluster, which became visual noise at month scale.
 *  - 1–2 events → small neutral dot
 *  - 3–5 events → medium dot
 *  - 6+ events  → large brand-tinted dot
 *  Returns null when the day has nothing. */
function densitySpec(n: number): { size: number; tint: string } | null {
  if (n <= 0) return null;
  if (n <= 2) return { size: 5, tint: "var(--app-ink-3)" };
  if (n <= 5) return { size: 7, tint: "var(--app-ink-2)" };
  return { size: 9, tint: "var(--app-brand)" };
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthGrid({
  month,
  byDay,
  total,
}: {
  month: string; // "YYYY-MM"
  byDay: Record<string, CalEvent[]>;
  total: number;
}) {
  const [y, m] = month.split("-").map(Number);
  const todayKey = useMemo(() => {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return p;
  }, []);

  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const [selected, setSelected] = useState<string | null>(todayKey.startsWith(month) ? todayKey : null);
  const selectedEvents = selected ? byDay[selected] ?? [] : [];

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Link
          href={`/events/calendar?m=${shiftMonth(month, -1)}`}
          onClick={() => haptic("light")}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full border transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
        <div className="text-center">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {monthLabel(month)}
          </h2>
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {total.toLocaleString()} events
          </p>
        </div>
        <Link
          href={`/events/calendar?m=${shiftMonth(month, 1)}`}
          onClick={() => haptic("light")}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full border transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
      </div>

      {/* Grid */}
      <div
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--app-border)" }}>
          {WD.map((w, i) => {
            const isWeekend = i === 0 || i === 6;
            return (
              <div
                key={i}
                className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: isWeekend ? "var(--app-ink-2)" : "var(--app-ink-3)",
                  background: isWeekend ? "var(--app-bg-sunken)" : "transparent",
                }}
              >
                {w}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((key, i) => {
            const dayOfWeek = i % 7; // 0 = Sun, 6 = Sat
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            if (!key) {
              return (
                <div
                  key={i}
                  className="aspect-square border-b border-r"
                  style={{
                    borderColor: "var(--app-border)",
                    // Weekend tint extends into the empty leading/trailing
                    // cells so the weekend column reads as one continuous
                    // strip, not a broken pattern at the month edges.
                    background: isWeekend
                      ? "color-mix(in srgb, var(--app-bg-sunken) 55%, transparent)"
                      : "transparent",
                  }}
                />
              );
            }
            const evs = byDay[key] ?? [];
            const dayNum = Number(key.split("-")[2]);
            const isToday = key === todayKey;
            const isSel = key === selected;
            const density = densitySpec(evs.length);
            // Compose the cell background: selected wins, then weekend
            // tint, then nothing. Selected uses paper-2 so it reads as
            // a single picked day; weekend uses a softer 55% paper-2.
            const cellBg = isSel
              ? "var(--app-bg-sunken)"
              : isWeekend
                ? "color-mix(in srgb, var(--app-bg-sunken) 55%, transparent)"
                : "transparent";
            return (
              <button
                key={i}
                type="button"
                onClick={() => { haptic("light"); setSelected(key); }}
                className="relative aspect-square border-b border-r p-1 text-left transition active:scale-[0.97]"
                style={{
                  borderColor: "var(--app-border)",
                  background: cellBg,
                }}
                aria-label={`${evs.length} ${evs.length === 1 ? "event" : "events"} on ${key}`}
              >
                {/* Today bar — a thin brand strip at the top of the cell
                 *  is more legible at a glance than relying only on a
                 *  filled day-number circle. */}
                {isToday && (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 top-0 h-[2px]"
                    style={{ background: "var(--app-brand)" }}
                  />
                )}
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                  style={{
                    background: isToday ? "var(--app-brand)" : "transparent",
                    color: isToday ? "white" : "var(--app-ink)",
                  }}
                >
                  {dayNum}
                </span>
                {/* Density signal — one dot whose size + tint scales with
                 *  the day's event count. Reads cleaner at month scale
                 *  than the previous "up to 3 muni dots + +N" pile. The
                 *  per-event muni colors still surface on the picked
                 *  day's list below. */}
                {density && (
                  <span
                    aria-hidden
                    className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      width: density.size,
                      height: density.size,
                      background: density.tint,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-day list */}
      {selected && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {" · "}
            {selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}
          </h3>
          {selectedEvents.length === 0 ? (
            <p
              className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-sm"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              Nothing scheduled this day.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e) => {
                const time = e.allDay ? "All day" : formatEventTime(e.startUtc);
                const Inner = (
                  <div
                    className="flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <span className="w-16 shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {time}
                    </span>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: muniColor(e.municipality) }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--app-ink)" }}>{e.title}</p>
                      <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                        {e.municipality}{e.category ? ` · ${e.category}` : ""}
                      </p>
                    </div>
                    {e.href !== "#" && <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />}
                  </div>
                );
                return (
                  <li key={e.id}>
                    {e.href === "#" ? (
                      Inner
                    ) : e.href.startsWith("/") ? (
                      <Link href={e.href} onClick={() => haptic("light")}>{Inner}</Link>
                    ) : (
                      <a href={e.href} target="_blank" rel="noopener noreferrer" onClick={() => haptic("light")}>{Inner}</a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
