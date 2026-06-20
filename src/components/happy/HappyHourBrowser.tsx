"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Martini } from "lucide-react";
import DealLines from "@/components/happy/DealLines";
import { figureCount } from "@/lib/happyHourDeal";

/**
 * HappyHourBrowser — the interactive, day-aware reveal for /happy-hour.
 *
 * A field-guide "almanac week": a 7-day strip shows how many verified happy
 * hours run each day (density at a glance, today marked), and tapping a day
 * reveals that day's spots — sorted by start time, the ones ON NOW flagged
 * inline, each showing its window FOR THAT DAY plus the full deal.
 *
 * Rows are DENSE (a small photo thumb + two tight lines) so many fit per
 * screen, and the deal text is shown in FULL (no truncation) — the moat is the
 * specifics, so we never clip them. Rows whose schedule can't be parsed into
 * days never claim a day; they sit in a quiet "schedule varies" shelf.
 */

export type HHWindowLite = { days: number[]; start: number; end: number };
export type HHRow = {
  slug: string;
  name: string;
  town?: string;
  photo?: string;
  deal?: string;
  parking?: string;
  note?: string;
  sourceUrl?: string;
  verified: string | null;
  schedule: string;
  windows: HHWindowLite[];
};

const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtMin(m: number): string {
  if (m >= 1440) return "late";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

function dayWindows(row: HHRow, day: number): HHWindowLite[] {
  return row.windows.filter((w) => w.days.includes(day)).sort((a, b) => a.start - b.start);
}
function fmtWindows(ws: HHWindowLite[]): string {
  return ws.map((w) => (w.start === 0 && w.end >= 1440 ? "All day" : `${fmtMin(w.start)}–${fmtMin(w.end)}`)).join(", ");
}

function PhotoFallback() {
  return (
    <div aria-hidden className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 28%, var(--app-brand-2)) 0%, var(--app-brand-2) 70%)" }}>
      <Martini className="h-5 w-5" strokeWidth={1.75} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, #fff)" }} />
    </div>
  );
}

// A deterministic accent per town so each town reads as its own colored
// "chapter" of the guide (same family the Saved page uses).
const TOWN_ACCENTS = ["#E14328", "#20506A", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function townAccent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return TOWN_ACCENTS[Math.abs(h) % TOWN_ACCENTS.length];
}

/** Dense field-guide row: a colored chapter rail + 52px thumb, then the venue,
 *  the time (accent mono), and the FULL deal. On-now gets a red rail + a
 *  "till X" flag; otherwise the rail takes the town's chapter color. */
function RowCard({ r, when, live, endsAt, accent, hideTown }: { r: HHRow; when: string; live?: boolean; endsAt?: number; accent?: string; hideTown?: boolean }) {
  const rail = live ? "var(--app-brand)" : accent ?? "var(--app-border)";
  return (
    <article
      className="tactile-interactive relative flex gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2 pl-3"
      style={{
        borderColor: live ? "color-mix(in srgb, var(--app-brand) 34%, var(--app-border))" : "var(--app-border)",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      {/* Chapter / on-now accent rail. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: rail }} />
      <Link href={`/places/${r.slug}`} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="52px" className="object-cover" /> : <PhotoFallback />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {r.name}
            {!hideTown && r.town && <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${r.town}`}</span>}
          </h3>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]" style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}>
              <span aria-hidden className="live-dot h-1 w-1 rounded-full" style={{ background: "var(--app-on-brand)" }} />
              {endsAt && endsAt < 1440 ? `till ${fmtMin(endsAt)}` : "on now"}
            </span>
          ) : r.verified ? (
            <span aria-label="verified" title="verified at the source" className="shrink-0 font-mono text-[11px] font-bold leading-none" style={{ color: "var(--app-positive)" }}>✓</span>
          ) : null}
        </div>
        {/* WHEN (accent mono), then the deal as clean clauses (each figure
            glued to its item; runs through DealLines so separators normalize
            and no raw em dash leaks into user copy). */}
        <p className="mt-0.5 font-mono text-[11.5px] font-semibold tabular-nums tracking-[0.01em]" style={{ color: "var(--app-ink-2)" }}>{when}</p>
        {r.deal && (
          <DealLines deal={r.deal} layout="inline" max={4} vague={figureCount(r.deal) === 0} className="mt-0.5 line-clamp-2 text-[12.5px]" />
        )}
      </div>
    </article>
  );
}

export default function HappyHourBrowser({ rows, today, nowMin }: { rows: HHRow[]; today: number; nowMin: number }) {
  const [day, setDay] = useState(today);

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) {
      const ds = new Set<number>();
      for (const w of r.windows) for (const d of w.days) ds.add(d);
      for (const d of ds) c[d]++;
    }
    return c;
  }, [rows]);

  const parsed = useMemo(() => rows.filter((r) => r.windows.length > 0), [rows]);
  const varies = useMemo(() => rows.filter((r) => r.windows.length === 0), [rows]);

  const forDay = useMemo(() => {
    const isToday = day === today;
    type Item = { r: HHRow; ws: HHWindowLite[]; live: boolean; endsAt?: number };
    const list: Item[] = parsed
      .map((r) => ({ r, ws: dayWindows(r, day) }))
      .filter((x) => x.ws.length > 0)
      .map((x) => {
        const liveWin = isToday ? x.ws.find((w) => nowMin >= w.start && nowMin < w.end) : undefined;
        return { r: x.r, ws: x.ws, live: Boolean(liveWin), endsAt: liveWin?.end };
      });
    // Group the day's spots into TOWN chapters.
    const groups = new Map<string, Item[]>();
    for (const it of list) {
      const town = it.r.town || "Frederick County";
      (groups.get(town) ?? groups.set(town, []).get(town)!).push(it);
    }
    // Within a town: on-now first, then by start time.
    for (const arr of groups.values()) {
      arr.sort((a, b) => Number(b.live) - Number(a.live) || a.ws[0].start - b.ws[0].start);
    }
    // Town order: towns with something on-now first, then by count, then name.
    const towns = [...groups.entries()].sort((a, b) => {
      const al = a[1].some((x) => x.live), bl = b[1].some((x) => x.live);
      if (al !== bl) return al ? -1 : 1;
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });
    return { towns, isToday, total: list.length };
  }, [parsed, day, today, nowMin]);

  return (
    <div className="space-y-4">
      {/* ── Week strip — the almanac. Each day shows its happy-hour count; tap
          to browse that day. Today carries a dot. Mobile-first 7-up grid. */}
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LETTER.map((letter, d) => {
          const active = d === day;
          const isToday = d === today;
          const n = counts[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-label={`${DAY_FULL[d]}: ${n} happy hour${n === 1 ? "" : "s"}`}
              aria-pressed={active}
              className="tactile-interactive flex flex-col items-center gap-1 rounded-[var(--app-radius-md)] py-2 transition"
              style={{
                background: active ? "var(--app-brand-press)" : "var(--app-bg-elevated)",
                boxShadow: active ? "var(--app-elev-1)" : "var(--app-edge), var(--app-hi)",
                border: active ? "none" : "1px solid var(--app-border)",
              }}
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: active ? "var(--app-on-brand)" : "var(--app-ink-2)" }}>{letter}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums leading-none" style={{ color: active ? "var(--app-on-brand)" : n > 0 ? "var(--app-ink)" : "var(--app-ink-3)" }}>{n || "·"}</span>
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: isToday ? (active ? "var(--app-on-brand)" : "var(--app-accent)") : "transparent" }} />
            </button>
          );
        })}
      </div>

      {/* ── Selected day's reveal — dense rows, on-now first. */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{forDay.isToday ? "Today" : DAY_FULL[day]}</h2>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{forDay.total}</span>
        </div>

        {forDay.total === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            No verified happy hours on {DAY_FULL[day]} yet. Try another day.
          </p>
        ) : (
          <div className="space-y-3.5">
            {forDay.towns.map(([town, items]) => {
              const color = townAccent(town);
              return (
                <section key={town} className="space-y-2">
                  {/* Town chapter header — the field-guide "chapter" band in the
                      town's own color (matches the Saved page grammar). */}
                  <header className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-1.5" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                    <span aria-hidden className="block h-5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <h3 className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{town}</h3>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{items.length}</span>
                  </header>
                  <ul className="space-y-2">
                    {items.map(({ r, ws, live, endsAt }) => (
                      <li key={r.slug}><RowCard r={r} when={fmtWindows(ws)} live={live} endsAt={endsAt} accent={color} hideTown /></li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Schedule-varies shelf — verified spots whose hours don't parse into
          a fixed day; shown honestly rather than dropped or pinned to a day. */}
      {varies.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-ink-2)" }}>Schedule varies</h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{varies.length}</span>
          </div>
          <ul className="space-y-2">
            {varies.map((r) => (<li key={r.slug}><RowCard r={r} when={r.schedule} /></li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
