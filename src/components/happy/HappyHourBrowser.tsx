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
 * reveals that day's spots — sorted by start time, the ones ON NOW led as big
 * photo cards, each row showing its window FOR THAT DAY. This answers the real
 * question ("where can I go Thursday?") far better than one flat list, and the
 * whole control is built mobile-first (the week strip is a 7-up grid, the cards
 * stack). Rows whose schedule can't be parsed into days never claim a day —
 * they sit in a quiet "schedule varies" shelf so nothing is lost or faked.
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

/** The window(s) a row runs on a given day, formatted ("3–6 PM"). */
function dayWindows(row: HHRow, day: number): HHWindowLite[] {
  return row.windows.filter((w) => w.days.includes(day)).sort((a, b) => a.start - b.start);
}
function fmtWindows(ws: HHWindowLite[]): string {
  return ws.map((w) => (w.start === 0 && w.end >= 1440 ? "All day" : `${fmtMin(w.start)}–${fmtMin(w.end)}`)).join(", ");
}
function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

function PhotoFallback({ rounded }: { rounded?: string }) {
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{ borderRadius: rounded, background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 28%, var(--app-brand-2)) 0%, var(--app-brand-2) 70%)" }}
    >
      <Martini className="h-7 w-7" strokeWidth={1.75} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, #fff)" }} />
    </div>
  );
}

function TownChip({ town, onDark }: { town?: string; onDark?: boolean }) {
  if (!town) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.07em]"
      style={onDark ? { background: "rgba(20,16,12,0.55)", color: "#fff" } : { background: "color-mix(in srgb, var(--app-ink) 8%, transparent)", color: "var(--app-ink-2)" }}
    >
      <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: "currentColor", opacity: 0.7 }} />
      {town}
    </span>
  );
}

function NoteLine({ label, children, accent, strong, mono, clamp }: {
  label: string; children: React.ReactNode; accent?: boolean; strong?: boolean; mono?: boolean; clamp?: 1 | 2;
}) {
  const valColor = accent || strong ? "var(--app-ink)" : "var(--app-ink-2)";
  const weight = accent ? "font-semibold" : strong ? "font-medium" : "";
  return (
    <div className="flex gap-3">
      <span className="w-[44px] shrink-0 pt-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.09em]" style={{ color: accent ? "var(--app-accent)" : "var(--app-ink-3)" }}>{label}</span>
      <span className={`min-w-0 flex-1 text-[12.5px] leading-snug ${weight} ${mono ? "font-mono tabular-nums" : ""} ${clamp === 1 ? "line-clamp-1" : clamp === 2 ? "line-clamp-2" : ""}`} style={{ color: valColor }}>{children}</span>
    </div>
  );
}

function Footer({ town, host, verified }: { town?: string; host?: string; verified?: string | null }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
      {town && <span>{town}</span>}
      {host && <><span aria-hidden>·</span><span>via {host}</span></>}
      {verified && <><span aria-hidden>·</span><span style={{ color: "var(--app-positive)" }}>{verified}</span></>}
    </p>
  );
}

/** Big photo-led card for a spot ON NOW (today view). */
function FeatureCard({ r, when, endsAt }: { r: HHRow; when: string; endsAt?: number }) {
  const host = hostOf(r.sourceUrl);
  return (
    <article className="tactile tactile-interactive relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]" style={{ borderColor: "color-mix(in srgb, var(--app-brand) 35%, var(--app-border))", boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)" }}>
      <Link href={`/places/${r.slug}`} className="block outline-none">
        <span className="absolute inset-0 z-20" aria-hidden />
        <div className="relative h-[148px] w-full">
          {r.photo ? <Image src={r.photo} alt="" fill sizes="(max-width:720px) 100vw, 680px" className="object-cover" /> : <PhotoFallback />}
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(16,12,10,0.80) 0%, rgba(16,12,10,0.10) 46%, rgba(16,12,10,0.20) 100%)" }} />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white" style={{ background: "var(--app-brand)", boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--app-brand) 60%, transparent)" }}>
              <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
              {endsAt && endsAt < 1440 ? `On now · till ${fmtMin(endsAt)}` : "On now"}
            </span>
            <TownChip town={r.town} onDark />
          </div>
          <h3 className="absolute inset-x-0 bottom-0 p-3 font-serif text-[21px] font-semibold leading-tight tracking-tight text-white">{r.name}</h3>
        </div>
        <div className="space-y-1.5 p-3.5">
          <NoteLine label="When" accent mono clamp={2}>{when}</NoteLine>
          {r.deal && <NoteLine label="Deal" strong clamp={2}>{r.deal}</NoteLine>}
          {r.parking && <NoteLine label="Park" clamp={2}>{r.parking}</NoteLine>}
          {r.note && <NoteLine label="Note" clamp={2}>{r.note}</NoteLine>}
          <div className="pt-1.5" style={{ borderTop: "1px solid var(--app-border)" }} />
          <Footer host={host} verified={r.verified} />
        </div>
      </Link>
    </article>
  );
}

/** Compact row, leading with the time window for the chosen day. */
function RowCard({ r, when, live }: { r: HHRow; when: string; live?: boolean }) {
  const host = hostOf(r.sourceUrl);
  return (
    <article className="tactile tactile-interactive relative flex gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5" style={{ borderColor: live ? "color-mix(in srgb, var(--app-brand) 30%, var(--app-border))" : "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}>
      <Link href={`/places/${r.slug}`} className="block outline-none"><span className="absolute inset-0" aria-hidden /></Link>
      <div className="relative h-[92px] w-[78px] shrink-0 overflow-hidden rounded-[12px]">
        {r.photo ? <Image src={r.photo} alt="" fill sizes="78px" className="object-cover" /> : <PhotoFallback rounded="12px" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[14.5px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>{r.name}</h3>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white" style={{ background: "var(--app-brand)" }}>
              <span aria-hidden className="live-dot h-1 w-1 rounded-full bg-white" />on now
            </span>
          ) : r.verified ? (
            <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] tabular-nums" style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}>verified</span>
          ) : null}
        </div>
        <TownChip town={r.town} />
        <NoteLine label="When" accent mono clamp={1}>{when}</NoteLine>
        {r.deal && <NoteLine label="Deal" strong clamp={1}>{r.deal}</NoteLine>}
        <Footer host={host} />
      </div>
    </article>
  );
}

export default function HappyHourBrowser({ rows, today, nowMin }: { rows: HHRow[]; today: number; nowMin: number }) {
  const [day, setDay] = useState(today);

  // Per-day counts for the week strip — density at a glance.
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

  // The selected day's spots, sorted by start time. On the current day, split
  // the live ones out to lead as feature cards.
  const forDay = useMemo(() => {
    const list = parsed
      .map((r) => ({ r, ws: dayWindows(r, day) }))
      .filter((x) => x.ws.length > 0)
      .sort((a, b) => a.ws[0].start - b.ws[0].start);
    const isToday = day === today;
    const live = isToday ? list.filter((x) => x.ws.some((w) => nowMin >= w.start && nowMin < w.end)) : [];
    const liveSlugs = new Set(live.map((x) => x.r.slug));
    const upcoming = list.filter((x) => !liveSlugs.has(x.r.slug));
    return { live, upcoming, isToday };
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

      {/* ── Selected day's reveal. */}
      <div className="space-y-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            {forDay.isToday ? "Today" : DAY_FULL[day]}
          </h2>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{forDay.live.length + forDay.upcoming.length}</span>
        </div>

        {forDay.live.length === 0 && forDay.upcoming.length === 0 ? (
          <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[12.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            No verified happy hours on {DAY_FULL[day]} yet. Try another day.
          </p>
        ) : (
          <>
            {forDay.live.length > 0 && (
              <ul className="space-y-2.5">
                {forDay.live.map(({ r, ws }) => (
                  <li key={r.slug}><FeatureCard r={r} when={fmtWindows(ws)} endsAt={ws.find((w) => nowMin >= w.start && nowMin < w.end)?.end} /></li>
                ))}
              </ul>
            )}
            {forDay.upcoming.length > 0 && (
              <ul className="space-y-2.5">
                {forDay.upcoming.map(({ r, ws }) => (
                  <li key={r.slug}><RowCard r={r} when={fmtWindows(ws)} /></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ── Schedule-varies shelf — verified spots whose hours don't parse into
          a fixed day; shown honestly rather than dropped or pinned to a day. */}
      {varies.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-ink-2)" }}>Schedule varies</h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{varies.length}</span>
          </div>
          <ul className="space-y-2.5">
            {varies.map((r) => (<li key={r.slug}><RowCard r={r} when={r.schedule} /></li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
