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
          {WD.map((w, i) => (
            <div key={i} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-ink-3)" }}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((key, i) => {
            if (!key) return <div key={i} className="aspect-square border-b border-r" style={{ borderColor: "var(--app-border)" }} />;
            const evs = byDay[key] ?? [];
            const dayNum = Number(key.split("-")[2]);
            const isToday = key === todayKey;
            const isSel = key === selected;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { haptic("light"); setSelected(key); }}
                className="relative aspect-square border-b border-r p-1 text-left transition active:scale-[0.97]"
                style={{
                  borderColor: "var(--app-border)",
                  background: isSel ? "var(--app-bg-sunken)" : "transparent",
                }}
                aria-label={`${evs.length} events on ${key}`}
              >
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                  style={{
                    background: isToday ? "var(--app-brand)" : "transparent",
                    color: isToday ? "white" : "var(--app-ink)",
                  }}
                >
                  {dayNum}
                </span>
                {/* up to 3 dots by municipality */}
                <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                  {evs.slice(0, 3).map((e, j) => (
                    <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: muniColor(e.municipality) }} aria-hidden />
                  ))}
                  {evs.length > 3 && (
                    <span className="text-[8px] font-bold leading-none" style={{ color: "var(--app-ink-3)" }}>
                      +{evs.length - 3}
                    </span>
                  )}
                </div>
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
