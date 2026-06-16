"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Martini } from "lucide-react";

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

/** Dense field-guide row: 52px thumb + name·town, then the time (accent mono)
 *  and the FULL deal. On-now gets a red edge + a "till X" flag. */
function RowCard({ r, when, live, endsAt }: { r: HHRow; when: string; live?: boolean; endsAt?: number }) {
  return (
    <article
      className="tactile-interactive relative flex gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2"
      style={{
        borderColor: live ? "color-mix(in srgb, var(--app-brand) 34%, var(--app-border))" : "var(--app-border)",
        boxShadow: "var(--app-edge), var(--app-hi)",
      }}
    >
      {/* On-now accent rail. */}
      {live && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-l-[var(--app-radius-md)]" style={{ background: "var(--app-brand)" }} />}
      <Link href={`/places/${r.slug}`} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="52px" className="object-cover" /> : <PhotoFallback />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {r.name}
            {r.town && <span className="font-normal" style={{ color: "var(--app-ink-3)" }}>{`  ·  ${r.town}`}</span>}
          </h3>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-white" style={{ background: "var(--app-brand)" }}>
              <span aria-hidden className="live-dot h-1 w-1 rounded-full bg-white" />
              {endsAt && endsAt < 1440 ? `till ${fmtMin(endsAt)}` : "on now"}
            </span>
          ) : r.verified ? (
            <span aria-label="verified" title="verified at the source" className="shrink-0 font-mono text-[11px] font-bold leading-none" style={{ color: "var(--app-positive)" }}>✓</span>
          ) : null}
        </div>
        {/* WHEN (accent mono) + the FULL deal — no truncation; the specifics
            are the whole point. */}
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          <span className="font-mono font-semibold tabular-nums tracking-[0.01em]" style={{ color: "var(--app-accent)" }}>{when}</span>
          {r.deal && <span> · <span style={{ color: "var(--app-ink)" }}>{r.deal}</span></span>}
        </p>
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
    const list = parsed
      .map((r) => ({ r, ws: dayWindows(r, day) }))
      .filter((x) => x.ws.length > 0)
      .sort((a, b) => a.ws[0].start - b.ws[0].start);
    const isToday = day === today;
    const live = isToday ? list.filter((x) => x.ws.some((w) => nowMin >= w.start && nowMin < w.end)) : [];
    const liveSlugs = new Set(live.map((x) => x.r.slug));
    const upcoming = list.filter((x) => !liveSlugs.has(x.r.slug));
    return { live, upcoming, isToday, total: list.length };
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
              aria-label={`${DAY_FULL[d]} — ${n} happy hour${n === 1 ? "" : "s"}`}
              aria-pressed={active}
              className="tactile-interactive flex flex-col items-center gap-1 rounded-[var(--app-radius-md)] py-2 transition"
              style={{
                background: active ? "var(--app-brand)" : "var(--app-bg-elevated)",
                boxShadow: active ? "var(--app-elev-1)" : "var(--app-edge), var(--app-hi)",
                border: active ? "none" : "1px solid var(--app-border)",
              }}
            >
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: active ? "#fff" : "var(--app-ink-2)" }}>{letter}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums leading-none" style={{ color: active ? "#fff" : n > 0 ? "var(--app-ink)" : "var(--app-ink-3)" }}>{n || "·"}</span>
              <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: isToday ? (active ? "#fff" : "var(--app-accent)") : "transparent" }} />
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
          <ul className="space-y-2">
            {forDay.live.map(({ r, ws }) => (
              <li key={r.slug}><RowCard r={r} when={fmtWindows(ws)} live endsAt={ws.find((w) => nowMin >= w.start && nowMin < w.end)?.end} /></li>
            ))}
            {forDay.upcoming.map(({ r, ws }) => (
              <li key={r.slug}><RowCard r={r} when={fmtWindows(ws)} /></li>
            ))}
          </ul>
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
