"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Martini } from "lucide-react";
import HappyHourBrowser, { type HHRow } from "./HappyHourBrowser";
import { dealHook, splitDeal } from "@/lib/happyHourDeal";

/**
 * HappyHourGuide — "The Last Pour", /happy-hour as a live city-magazine bar
 * guide (picked from a 5-direction design panel: top-scored on beauty +
 * cleverness + brand-fit + making the amount-off the hero).
 *
 * The page opens on a COVER STORY: the single most time-sensitive pour right
 * now (on-now, ending soonest), as a full-bleed photo with the venue name in
 * serif and its extracted deal hook ("50% OFF", "$5 DRAFTS") set huge in gold
 * mono. Below is THE GUIDE: a leader-dotted priced index where every line is
 * "VENUE ········· $5 MARGARITAS" — a serif name, a real dotted leader, the
 * gold mono hook flush-right, like a wine list's contents page. The amount-off
 * is welded to the name as the hero, exactly as asked.
 *
 * The editorial frame IS the live engine: the cover re-casts as windows open
 * and last-call hits (a 45s Eastern re-sync, seeded server-side so first paint
 * is honest with no hydration flash). Honest throughout: "on now" only from a
 * real parsed window; no-number deals read "Specials" (never a faked figure);
 * unparseable schedules sit in a calm closing column; a "Now / All week" toggle
 * flips to the day-by-day planner. Ordered by live-status, not by town (the
 * data is mostly Frederick, so town chapters would fragment the index).
 */

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtMin(m: number): string {
  if (m >= 1440) return "close";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${mer}` : `${h12}:${String(mm).padStart(2, "0")} ${mer}`;
}

function untilLabel(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

/** Eastern {day 0-6, minutes-since-midnight} from the real client clock. */
function easternNowParts(): { day: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: wd[get("weekday")] ?? 0, min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

type Kind = "live" | "later" | "other";
type Item = {
  r: HHRow;
  hook: string | null;
  kind: Kind;
  endsAt?: number;
  lastCall?: boolean;
  startsAt?: number;
  day?: number; // for "other": the soonest future day it runs
};

function classify(rows: HHRow[], day: number, nowMin: number) {
  const parsed = rows.filter((r) => r.windows.length > 0);
  const varies = rows.filter((r) => r.windows.length === 0);

  const live: Item[] = [];
  const later: Item[] = [];
  const other: Item[] = [];

  for (const r of parsed) {
    const hook = dealHook(r.deal);
    const todays = r.windows.filter((w) => w.days.includes(day)).sort((a, b) => a.start - b.start);
    const liveWin = todays.find((w) => nowMin >= w.start && nowMin < w.end);
    if (liveWin) {
      live.push({ r, hook, kind: "live", endsAt: liveWin.end, lastCall: liveWin.end < 1440 && liveWin.end - nowMin <= 30 });
      continue;
    }
    const upcoming = todays.find((w) => w.start > nowMin);
    if (upcoming) {
      later.push({ r, hook, kind: "later", startsAt: upcoming.start });
      continue;
    }
    // Runs on another day: find the soonest future occurrence (1..7 ahead).
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      const w = r.windows.filter((x) => x.days.includes(d)).sort((a, b) => a.start - b.start)[0];
      if (w) {
        other.push({ r, hook, kind: "other", day: d, startsAt: w.start });
        break;
      }
    }
  }
  live.sort((a, b) => Number(b.lastCall) - Number(a.lastCall) || (a.endsAt! - b.endsAt!));
  later.sort((a, b) => a.startsAt! - b.startsAt!);
  // Other: by day distance from today, then start time.
  other.sort((a, b) => ((a.day! - day + 7) % 7) - ((b.day! - day + 7) % 7) || a.startsAt! - b.startsAt!);

  return { live, later, other, varies };
}

/** How strong/enticing a hook reads, for choosing the cover story. */
function hookStrength(hook: string | null): number {
  if (!hook) return 0;
  if (hook.endsWith("% OFF")) return 300 + (parseInt(hook, 10) || 0); // "50% OFF" beats "25% OFF"
  if (hook.includes(" OFF")) return 200; // "$5 OFF"
  if (hook.startsWith("FROM")) return 100; // "FROM $3"
  return 0; // "Specials"
}
/** Cover-worthiness: a photo is essential to the full-bleed, then last-call
 *  urgency, then the most enticing hook. */
function coverScore(it: Item): number {
  return (it.r.photo ? 1000 : 0) + (it.lastCall ? 400 : 0) + hookStrength(it.hook);
}

function PhotoFallback({ big }: { big?: boolean }) {
  return (
    <div aria-hidden className="grid h-full w-full place-items-center" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--app-accent) 30%, var(--app-brand-2)) 0%, var(--app-brand-2) 72%)" }}>
      <Martini className={big ? "h-10 w-10" : "h-5 w-5"} strokeWidth={1.5} style={{ color: "color-mix(in srgb, var(--app-accent) 60%, #fff)" }} />
    </div>
  );
}

/** The status tab + label for the cover, by kind. */
function coverTab(it: Item): { label: string; tone: "live" | "lastcall" | "soon" } {
  if (it.kind === "live") {
    if (it.lastCall) return { label: `Last call · till ${fmtMin(it.endsAt!)}`, tone: "lastcall" };
    return { label: it.endsAt! >= 1440 ? "On now · till close" : `On now · till ${fmtMin(it.endsAt!)}`, tone: "live" };
  }
  if (it.kind === "later") return { label: `Next pour · opens ${fmtMin(it.startsAt!)}`, tone: "soon" };
  return { label: `Opens ${DAY_ABBR[it.day!]} · ${fmtMin(it.startsAt!)}`, tone: "soon" };
}

function Cover({ it, bloom }: { it: Item; bloom?: boolean }) {
  const tab = coverTab(it);
  const tabColor = tab.tone === "lastcall" ? "var(--app-brand)" : tab.tone === "live" ? "var(--app-brand)" : "var(--app-accent)";
  return (
    <Link
      href={`/places/${it.r.slug}`}
      aria-label={`${it.r.name}${it.hook ? `: ${it.hook}` : ""}${it.r.deal ? `. ${it.r.deal}` : ""}`}
      className={`tactile-interactive relative block aspect-[16/11] overflow-hidden rounded-[var(--app-radius-lg)]${bloom ? " pop-in" : ""}`}
      style={{ boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      {it.r.photo ? <Image src={it.r.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" /> : <PhotoFallback big />}
      {/* Bottom ink scrim for legibility + a faint warm sheen up top. */}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 92%, transparent) 4%, color-mix(in srgb, var(--app-ink) 60%, transparent) 34%, transparent 62%), linear-gradient(to bottom, color-mix(in srgb, var(--app-accent) 14%, transparent), transparent 30%)" }} />

      {/* Status tab, top-left. */}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: tabColor }}>
        {(tab.tone === "live" || tab.tone === "lastcall") && <span aria-hidden className="live-dot h-1 w-1 rounded-full bg-white" />}
        {tab.label}
      </span>

      {/* Cover plate, bottom. */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        {it.r.town && <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "color-mix(in srgb, var(--app-accent) 60%, #fff)" }}>{it.r.town}</p>}
        <h2 className="mt-0.5 font-serif text-[26px] font-semibold leading-[1.02] tracking-[-0.01em] text-white">{it.r.name}</h2>
        <p className="mt-1 font-mono font-bold leading-none tracking-[-0.01em]" style={{ fontSize: it.hook ? "44px" : "26px", color: "color-mix(in srgb, var(--app-accent) 72%, #fff)" }}>
          {it.hook ?? "Specials"}
        </p>
        {it.r.deal && (
          <p className="mt-2 line-clamp-2 max-w-prose font-serif text-[13.5px] italic leading-snug" style={{ color: "rgba(255,255,255,0.92)" }}>
            &ldquo;{it.r.deal}&rdquo;
          </p>
        )}
      </div>
    </Link>
  );
}

/** The leader-dotted priced index line: VENUE ········· $5 MARGARITAS. */
function PricedRow({ it, nowMin }: { it: Item; nowMin: number }) {
  const live = it.kind === "live";
  const sub =
    it.kind === "live"
      ? it.lastCall ? `last call · till ${fmtMin(it.endsAt!)}` : it.endsAt! >= 1440 ? "till close" : `till ${fmtMin(it.endsAt!)}`
      : it.kind === "later"
        ? `opens ${fmtMin(it.startsAt!)} · ${untilLabel(it.startsAt! - nowMin)}`
        : `${DAY_ABBR[it.day!]} ${fmtMin(it.startsAt!)}`;
  // The deal SUBJECT (the offer with the figure removed) — so the priced
  // figure on the right never reads as "$5 of an unknown thing." When the
  // figure is the whole deal (no subject in the source), this is empty.
  // Show the offer detail under the row UNLESS it would just repeat the
  // right-hand figure label — so a "$5" row reads "$5 · house margaritas" and a
  // figure-less "Specials" row still says what the specials actually are.
  const { rest } = splitDeal(it.r.deal);
  const subject = rest && rest.toLowerCase() !== (it.hook ?? "Specials").toLowerCase() ? rest : "";
  return (
    <Link href={`/places/${it.r.slug}`} aria-label={`${it.r.name}${it.r.deal ? `: ${it.r.deal}` : ""}`} className="tactile-interactive group block py-1.5">
      <div className="flex items-baseline gap-1.5">
        {live && <span aria-hidden className="live-dot mb-0.5 h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: "var(--app-brand)" }} />}
        <span className="shrink-0 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-ink)", maxWidth: "58%" }}>{it.r.name}</span>
        <span aria-hidden className="mb-1 flex-1 self-end" style={{ borderBottom: "2px dotted color-mix(in srgb, var(--app-ink) 26%, transparent)" }} />
        <span className="shrink-0 font-mono text-[14px] font-bold tabular-nums tracking-[0.01em]" style={{ color: it.hook ? "var(--app-accent-press)" : "var(--app-ink-3)" }}>
          {it.hook ?? "Specials"}
        </span>
      </div>
      {/* What the deal is ON — the line that turns "$5" into "$5 · house margaritas". */}
      {subject && (
        <p className="mt-0.5 truncate text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{subject}</p>
      )}
      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
        <span style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>{sub}</span>
        {it.r.town && <><span aria-hidden>·</span><span className="truncate">{it.r.town}</span></>}
      </p>
    </Link>
  );
}

function IndexSection({ label, count, tone, items, nowMin }: { label: string; count: number; tone: string; items: Item[]; nowMin: number }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-0.5">
      <div className="flex items-baseline gap-2 pb-0.5">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone }}>{label}</h3>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{count}</span>
      </div>
      <ul className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
        {items.map((it) => <li key={it.r.slug}><PricedRow it={it} nowMin={nowMin} /></li>)}
      </ul>
    </section>
  );
}

export default function HappyHourGuide({
  rows, today, nowMin: seedMin,
}: {
  rows: HHRow[];
  today: number;
  nowMin: number;
}) {
  const [mode, setMode] = useState<"now" | "week">("now");
  const [day, setDay] = useState(today);
  const [nowMin, setNowMin] = useState(seedMin);
  const prevCover = useRef<string | null>(null);
  const [coverBloom, setCoverBloom] = useState(false);

  useEffect(() => {
    const sync = () => {
      const e = easternNowParts();
      setNowMin(e.min);
      setDay(e.day);
    };
    sync();
    const id = setInterval(sync, 45_000);
    return () => clearInterval(id);
  }, []);

  const { live, later, other, varies } = useMemo(() => classify(rows, day, nowMin), [rows, day, nowMin]);

  // Cover = the best on-now pour to feature: a photo carries the full-bleed,
  // then last-call urgency, then the most enticing hook (50% off beats $1 off),
  // tie-broken by ending soonest. With nothing live, demote honestly to the
  // next to open today, then the soonest this week. Never a faked "on now".
  const cover = useMemo(() => {
    if (live.length > 0) {
      return [...live].sort((a, b) => coverScore(b) - coverScore(a) || (a.endsAt! - b.endsAt!))[0];
    }
    return later[0] ?? other[0] ?? null;
  }, [live, later, other]);
  const coverSlug = cover?.r.slug;
  const liveRest = live.filter((x) => x.r.slug !== coverSlug);
  const laterRest = later.filter((x) => x.r.slug !== coverSlug);
  const otherRest = other.filter((x) => x.r.slug !== coverSlug);

  // Re-cast bloom when the cover changes to a different spot on a tick (the
  // one-shot "the issue's cover just changed" flourish). Safe: `cover` only
  // changes identity when the 45s tick re-derives a new lead pour, so this
  // can't loop; the timeout clears the flag without re-triggering the effect.
  useEffect(() => {
    const slug = cover?.r.slug ?? null;
    if (prevCover.current && prevCover.current !== slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transient animation flag fired by the live tick changing the cover; guarded so it can't loop
      setCoverBloom(true);
      const t = setTimeout(() => setCoverBloom(false), 1200);
      prevCover.current = slug;
      return () => clearTimeout(t);
    }
    prevCover.current = slug;
  }, [cover]);

  const liveCount = live.length;

  return (
    <div className="space-y-4">
      {/* Live status line + the Now / All week toggle. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: liveCount > 0 ? "var(--app-brand)" : "var(--app-ink-3)" }} />
          {fmtMin(nowMin)}
          <span aria-hidden>·</span>
          <span aria-live="polite" style={{ color: "var(--app-ink-2)" }}>
            {liveCount > 0 ? `${liveCount} pouring now` : later.length > 0 ? `next pour ${fmtMin(later[0].startsAt!)}` : "none on right now"}
          </span>
        </p>
        <div role="tablist" aria-label="View" className="flex shrink-0 items-center gap-1 rounded-full p-0.5" style={{ background: "var(--app-bg-sunken)", boxShadow: "var(--app-edge)" }}>
          {(["now", "week"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className="tactile-interactive rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition"
              style={mode === m ? { background: "var(--app-ink)", color: "var(--app-bg)" } : { color: "var(--app-ink-3)" }}
            >
              {m === "now" ? "Now" : "All week"}
            </button>
          ))}
        </div>
      </div>

      {mode === "week" ? (
        <HappyHourBrowser rows={rows} today={day} nowMin={nowMin} />
      ) : (
        <div className="space-y-5">
          {cover && <Cover it={cover} bloom={coverBloom} />}

          <IndexSection label="Also pouring now" count={liveRest.length} tone="var(--app-brand-press)" items={liveRest} nowMin={nowMin} />
          <IndexSection label="Opening later today" count={laterRest.length} tone="var(--app-accent)" items={laterRest} nowMin={nowMin} />
          <IndexSection label="More this week" count={otherRest.length} tone="var(--app-ink-2)" items={otherRest} nowMin={nowMin} />

          {/* Schedule varies — verified spots whose hours don't parse to a day. */}
          {varies.length > 0 && (
            <section className="space-y-0.5">
              <div className="flex items-baseline gap-2 pb-0.5">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>Schedule varies</h3>
                <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{varies.length}</span>
              </div>
              <ul className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
                {varies.map((r) => {
                  const hook = dealHook(r.deal);
                  return (
                    <li key={r.slug}>
                      <Link href={`/places/${r.slug}`} aria-label={`${r.name}${hook ? `: ${hook}` : ""}`} className="tactile-interactive block py-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="shrink-0 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-ink)", maxWidth: "62%" }}>{r.name}</span>
                          <span aria-hidden className="mb-1 flex-1 self-end" style={{ borderBottom: "2px dotted color-mix(in srgb, var(--app-ink) 26%, transparent)" }} />
                          <span className="shrink-0 font-mono text-[14px] font-bold tracking-[0.01em]" style={{ color: hook ? "var(--app-accent-press)" : "var(--app-ink-3)" }}>{hook ?? "Specials"}</span>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>{r.schedule}{r.town ? ` · ${r.town}` : ""}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
