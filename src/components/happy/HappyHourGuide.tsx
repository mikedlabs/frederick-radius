"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import HappyHourBrowser, { type HHRow } from "./HappyHourBrowser";
import { dealClauses, dealHook, figureCount, dealQuality } from "@/lib/happyHourDeal";
import { isClosedNow } from "@/lib/hours";
import DealLines from "@/components/happy/DealLines";
import RadiusPhoto from "@/components/ui/RadiusPhoto";

/**
 * HappyHourGuide — "The Last Pour", /happy-hour as a live city-magazine bar
 * guide (picked from a 5-direction design panel: top-scored on beauty +
 * cleverness + brand-fit + making the amount-off the hero).
 *
 * The page opens on a COVER: the single most time-sensitive pour right now
 * (on-now, ending soonest). A real place photo leads it only when one actually
 * loads; the venue and its deal sit on a paper price plate, never over the
 * photo, with the deal figure set large in Ink. Below is THE GUIDE: a priced
 * index where each venue carries its own deal clauses, figures in semibold Ink
 * glued to what they are for.
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
    // A live window only reads "on now" when the venue isn't provably closed
    // (DQ-019): the White Rabbit case, an all-day pour on a day the kitchen is
    // dark. Closed → fall through to the upcoming/other buckets, so the row
    // still shows honestly as "opens later" rather than a "till close" lie.
    if (liveWin && !isClosedNow(r.hours, r.hoursVerified ?? false)) {
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
  // Deal QUALITY leads every section (clear figures above vague), then the
  // section's own urgency tie-breaker — so a clear deal never sinks below a
  // figureless "specials" entry just because the vague one ends sooner.
  const q = (it: Item) => dealQuality(it.r.deal);
  live.sort((a, b) => q(b) - q(a) || Number(b.lastCall) - Number(a.lastCall) || (a.endsAt! - b.endsAt!));
  later.sort((a, b) => q(b) - q(a) || a.startsAt! - b.startsAt!);
  // Other: quality, then day distance from today, then start time.
  other.sort((a, b) => q(b) - q(a) || ((a.day! - day + 7) % 7) - ((b.day! - day + 7) % 7) || a.startsAt! - b.startsAt!);

  return { live, later, other, varies };
}

/** Cover-worthiness, DEAL QUALITY FIRST: a figure-bearing deal (tier >= 1)
 *  always beats a vague one (tier 0) no matter how good its photo or how soon
 *  it ends, so the hero never leads with "specials at the bar". Within a tier,
 *  a photo carries the full-bleed, then last-call urgency. */
function coverScore(it: Item): number {
  return dealQuality(it.r.deal) * 1000 + (it.r.photo ? 100 : 0) + (it.lastCall ? 40 : 0);
}

const HALF_FIGURE = /\bhalf[-\s]?(?:off|price)\b|\b1\/2\s*(?:price|off)\b/i;

/**
 * The cover's lead line: the clause that carries dealHook's figure, so the
 * plate reads "$5 house spirits" rather than a bare "$5". The other clauses
 * stay in their posted order underneath. A deal with no figure has no lead,
 * and a hook no clause can be matched to falls back to the hook itself.
 */
export function coverDeal(deal: string | null | undefined): { lead: string | null; rest: string[] } {
  const clauses = dealClauses(deal);
  const hook = dealHook(deal);
  if (!hook || clauses.length === 0) return { lead: null, rest: clauses };
  const figure = hook.replace(/^FROM\s+/i, "").replace(/\s+OFF$/i, "");
  const pattern = figure
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/^\\\$/, "\\$\\s*");
  const exact = new RegExp(`(?<![\\d.])${pattern}(?![\\d.])`, "i");
  let index = clauses.findIndex((clause) => exact.test(clause));
  if (index === -1 && figure === "50%") index = clauses.findIndex((clause) => HALF_FIGURE.test(clause));
  if (index === -1) {
    const spoken = hook.replace(/^FROM /, "From ").replace(/ OFF$/, " off");
    return { lead: spoken, rest: clauses };
  }
  return { lead: clauses[index], rest: clauses.filter((_, i) => i !== index) };
}

/**
 * The live line under the deal. Amber marks a real open window, so the dot and
 * "On now until" appear only while the parsed window is open; otherwise the
 * venue's posted schedule is printed as text, never as a live state.
 */
function CoverWhen({ it }: { it: Item }) {
  if (it.kind === "live") {
    return (
      <p className="text-meta-lg inline-flex items-center gap-2 font-semibold" style={{ color: "var(--app-ink)" }}>
        <span aria-hidden className="live-dot h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--app-amber)" }} />
        On now until {fmtMin(it.endsAt!)}
      </p>
    );
  }
  return (
    <p className="text-meta-lg line-clamp-2" style={{ color: "var(--app-ink-2)" }}>
      {it.r.schedule}
    </p>
  );
}

/**
 * The lead pour. A real place photo, painted by RadiusPhoto so the proxy's
 * failure plate can never pass for one, sits above (or beside, on wider
 * screens) a paper price plate. Nothing is set over the photo. With no photo,
 * or when it fails, the plate stands alone on Cream: the venue, the deal
 * figure, the live or posted window, and the town. There is no stand-in
 * picture.
 */
function Cover({ it, bloom }: { it: Item; bloom?: boolean }) {
  const { lead, rest } = coverDeal(it.r.deal);
  const vague = Boolean(it.r.deal) && figureCount(it.r.deal) === 0;
  return (
    <Link
      href={`/places/${it.r.slug}`}
      aria-label={`${it.r.name}${it.hook ? `: ${it.hook}` : ""}${it.r.deal ? `. ${it.r.deal}` : ""}`}
      data-happy-cover
      className={`tactile-interactive block overflow-hidden rounded-[var(--app-radius-lg)] border sm:flex${bloom ? " pop-in" : ""}`}
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}
    >
      <RadiusPhoto
        src={it.r.photo}
        size={640}
        alt=""
        category={it.r.category ?? "bar"}
        sizes="(max-width: 640px) 100vw, 360px"
        className="aspect-[2/1] w-full sm:aspect-auto sm:min-h-44 sm:w-1/2"
      />
      <div className="min-w-0 flex-1 space-y-2 p-4">
        <p className="text-title" style={{ color: "var(--app-ink)" }}>{it.r.name}</p>
        {lead ? (
          <>
            <p className="display-3 font-bold" style={{ color: "var(--app-ink)" }}>{lead}</p>
            {rest.length > 0 && <DealLines deal={rest.join("; ")} max={2} className="text-body space-y-0.5" />}
          </>
        ) : it.r.deal ? (
          <DealLines deal={it.r.deal} max={3} vague={vague} className="text-body space-y-0.5" />
        ) : (
          <p className="text-body" style={{ color: "var(--app-ink-2)" }}>Specials</p>
        )}
        <CoverWhen it={it} />
        {it.r.town && <p className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>{it.r.town}</p>}
      </div>
    </Link>
  );
}

/** Compact venue row. Timing stays visible; town and deal sit below it. */
function PricedRow({ it, nowMin }: { it: Item; nowMin: number }) {
  const live = it.kind === "live";
  const sub =
    it.kind === "live"
      ? it.lastCall ? `last call · till ${fmtMin(it.endsAt!)}` : it.endsAt! >= 1440 ? "till close" : `till ${fmtMin(it.endsAt!)}`
      : it.kind === "later"
        ? `opens ${fmtMin(it.startsAt!)} · ${untilLabel(it.startsAt! - nowMin)}`
        : `${DAY_ABBR[it.day!]} ${fmtMin(it.startsAt!)}`;
  return (
    <Link href={`/places/${it.r.slug}`} aria-label={`${it.r.name}${it.r.deal ? `: ${it.r.deal}` : ""}`} className="tactile-interactive group block py-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        {live && <span aria-hidden className="live-dot mb-0.5 h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: "var(--app-brand)" }} />}
        <span className="min-w-0 flex-1 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>{it.r.name}</span>
        <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.04em]" style={{ color: live ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>{sub}</span>
      </div>
      {it.r.town && <span className="mt-0.5 block truncate text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>{it.r.town}</span>}
      {/* The deal — figures flow inline (glued to each item), clamped to keep the
          row compact. The full deal is on the place page. */}
      {it.r.deal ? (
        <DealLines deal={it.r.deal} max={4} layout="inline" vague={figureCount(it.r.deal) === 0} className="mt-0.5 line-clamp-2 text-[12.5px]" />
      ) : (
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>Specials</p>
      )}
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
      <ul className="divide-y divide-[color-mix(in_srgb,var(--app-border)_70%,transparent)]">
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
  const [query, setQuery] = useState("");
  const [showAllMore, setShowAllMore] = useState(false);
  const [showAllVaries, setShowAllVaries] = useState(false);
  const prevCover = useRef<string | null>(null);
  const [coverBloom, setCoverBloom] = useState(false);

  // Search over venue, town, deal text, and schedule, so "drafts", "oysters",
  // "half off", "wine", or a town/venue narrows the whole guide. Filters the
  // rows BEFORE they're classified, so every section (and the week planner)
  // reflects it. The quick chips just seed common searches.
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const shownRows = useMemo(
    () =>
      searching
        ? rows.filter((r) =>
            `${r.name} ${r.town ?? ""} ${r.deal ?? ""} ${r.schedule}`.toLowerCase().includes(q),
          )
        : rows,
    [rows, q, searching],
  );

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

  const { live, later, other, varies } = useMemo(() => classify(shownRows, day, nowMin), [shownRows, day, nowMin]);

  // Cover = the best on-now pour to feature, DEAL QUALITY FIRST: prefer a live
  // pour with a real figure (Roasthouse "50% OFF"), ranked by coverScore then
  // ending soonest. A vague "specials" entry is eligible only if literally
  // nothing figure-bearing is live. With nothing live at all, demote honestly
  // to the next to open today, then the soonest this week. Never a faked "now".
  const cover = useMemo(() => {
    if (live.length > 0) {
      const byScore = (a: Item, b: Item) => coverScore(b) - coverScore(a) || (a.endsAt! - b.endsAt!);
      const clearLive = live.filter((x) => dealQuality(x.r.deal) > 0);
      return (clearLive.length > 0 ? [...clearLive] : [...live]).sort(byScore)[0];
    }
    return later[0] ?? other[0] ?? null;
  }, [live, later, other]);
  // While searching the cover is hidden, so don't also strip its spot from the
  // sections — every match should show.
  const coverSlug = searching ? null : cover?.r.slug;
  const liveRest = live.filter((x) => x.r.slug !== coverSlug);
  const laterRest = later.filter((x) => x.r.slug !== coverSlug);
  const otherRest = other.filter((x) => x.r.slug !== coverSlug);
  const moreVisible = searching || showAllMore ? otherRest : otherRest.slice(0, 8);
  const hiddenMoreCount = otherRest.length - moreVisible.length;
  const variesVisible = searching || showAllVaries ? varies : varies.slice(0, 6);
  const hiddenVariesCount = varies.length - variesVisible.length;

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
  const townCount = useMemo(() => new Set(rows.map((r) => r.town).filter(Boolean)).size, [rows]);

  return (
    <div className="space-y-4">
      {/* Completeness strip — answers "what's on now AND how complete is this?"
          at a glance: the live count (vermilion), the verified total + town
          reach, and the at-source seal. The toggle to the week planner sits
          opposite. Counts are supporting detail, never the headline. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: liveCount > 0 ? "var(--app-brand-press)" : "var(--app-ink-2)" }}>
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: liveCount > 0 ? "var(--app-brand)" : "var(--app-ink-3)" }} />
            <span aria-live="polite">{liveCount > 0 ? `${liveCount} on now` : later.length > 0 ? `next ${fmtMin(later[0].startsAt!)}` : "none on now"}</span>
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: "var(--app-ink-2)" }}>{rows.length} verified</span>
          <span aria-hidden>·</span>
          <span style={{ color: "var(--app-ink-2)" }}>{townCount} {townCount === 1 ? "town" : "towns"}</span>
          <span aria-hidden>·</span>
          <span className="font-bold" style={{ color: "var(--app-positive)" }}>&#10003; at source</span>
        </p>
        <div role="tablist" aria-label="View" className="flex shrink-0 items-center gap-1 rounded-full p-0.5" style={{ background: "var(--app-bg-sunken)", boxShadow: "var(--app-edge)" }}>
          {(["now", "week"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className="tactile-interactive tap-44-y rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition"
              style={mode === m ? { background: "var(--app-ink)", color: "var(--app-bg)" } : { color: "var(--app-ink-3)" }}
            >
              {m === "now" ? "Now" : "All week"}
            </button>
          ))}
        </div>
      </div>

      {/* Find what you want — a search over venue/town/deal, plus quick taps
          for the common asks. Narrows every section below and the week
          planner, so 26 spots become the handful you're actually after. */}
      <div className="space-y-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search happy hours by deal, venue, or town"
            placeholder="Search: drafts, wine, oysters, a spot…"
            className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
            style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
              <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </div>
        <div className="max-w-full overflow-hidden">
          <ul className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {["Drafts", "Wine", "Cocktails", "Oysters", "Half off", "Wings"].map((label) => {
              const key = label.toLowerCase();
              const on = q === key;
              return (
                <li key={label} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuery(on ? "" : key)}
                    aria-pressed={on}
                    className="inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
                    style={
                      on
                        ? { borderColor: "var(--app-ink)", background: "var(--app-ink)", color: "var(--app-bg)" }
                        : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }
                    }
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {searching && (
          <p role="status" aria-live="polite" className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {shownRows.length === 0 ? "No matches" : `${shownRows.length} ${shownRows.length === 1 ? "spot" : "spots"} for “${query.trim()}”`}
          </p>
        )}
        {searching && shownRows.length === 0 && (
          <p className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
            No happy hour matches “{query.trim()}”. Try a plainer word like “beer” or “wine,” or clear the search.
          </p>
        )}
      </div>

      {mode === "week" ? (
        <HappyHourBrowser rows={shownRows} today={day} nowMin={nowMin} />
      ) : (
        <div className="space-y-5">
          {/* The "now" lead — framed by what's actually pouring this minute, so
              the headline is the answer ("pouring now"), not just a photo.
              Hidden while searching: a filtered set wants results, not a pick. */}
          {!searching && cover && (
            <section className="space-y-2" aria-labelledby="happy-cover-heading">
              <h2 id="happy-cover-heading" className="text-title-sm" style={{ color: "var(--app-ink)" }}>
                {cover.kind === "live" ? "Pouring now" : cover.kind === "later" ? "Next pour today" : "Next pour this week"}
              </h2>
              <Cover it={cover} bloom={coverBloom} />
            </section>
          )}

          <IndexSection label="Also pouring now" count={liveRest.length} tone="var(--app-brand-press)" items={liveRest} nowMin={nowMin} />
          <IndexSection label="Opening later today" count={laterRest.length} tone="var(--app-ink-2)" items={laterRest} nowMin={nowMin} />
          <IndexSection label="More this week" count={otherRest.length} tone="var(--app-ink-2)" items={moreVisible} nowMin={nowMin} />
          {hiddenMoreCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllMore(true)}
              className="min-h-11 w-full border-y text-[13px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
            >
              Show all {otherRest.length} later this week
            </button>
          )}

          {/* Schedule varies — verified spots whose hours don't parse to a day. */}
          {varies.length > 0 && (
            <section className="space-y-0.5">
              <div className="flex items-baseline gap-2 pb-0.5">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>Schedule varies</h3>
                <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{varies.length}</span>
              </div>
              <ul className="divide-y divide-[color-mix(in_srgb,var(--app-border)_70%,transparent)]">
                {variesVisible.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/places/${r.slug}`} aria-label={`${r.name}${r.deal ? `: ${r.deal}` : ""}`} className="tactile-interactive block py-1.5">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>{r.name}</span>
                        <span className="max-w-[48%] shrink-0 truncate text-right font-mono text-[11px] uppercase tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>{r.schedule}</span>
                      </div>
                      {r.town && <span className="mt-0.5 block truncate text-[11px] font-medium" style={{ color: "var(--app-ink-3)" }}>{r.town}</span>}
                      {r.deal ? (
                        <DealLines deal={r.deal} max={4} layout="inline" vague={figureCount(r.deal) === 0} className="mt-0.5 line-clamp-2 text-[12.5px]" />
                      ) : (
                        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>Specials</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              {hiddenVariesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllVaries(true)}
                  className="min-h-11 w-full border-t text-[13px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                >
                  Show all {varies.length} schedules
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
