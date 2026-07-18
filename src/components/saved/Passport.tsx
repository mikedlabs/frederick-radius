"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useSavedList } from "@/hooks/useSaved";
import { useBeenList } from "@/hooks/useBeenHere";
import { useAllNotes } from "@/hooks/useNotes";
import type { PlaceCardData } from "@/lib/loaders/places";
import { deriveStamps, type StampState, type StampTone } from "@/lib/stamps";

/**
 * Passport — the earned layer of /my-radius.
 *
 * Every stamp renders as a field-guide CANCELLATION seal (the ink kind a
 * ranger presses into a national-park passport): a flat double ring, the
 * title bent around the top arc, the second line around the bottom, a
 * small line engraving in the middle, and the day it was earned beneath
 * it. Flat ink on the paper, set on an even grid. The first cut of this
 * dressed the seal up as a POSTAGE stamp — perforated die-cut edge,
 * speckled postmark strike, random tilt, drop shadow — and the owner
 * called it what it was (2026-07-18: "cheesy"). Ornament went; the
 * engraving stayed.
 *
 * Honesty rules:
 *   - Stamps derive ONLY from real local signals (src/lib/stamps.ts).
 *   - First-earned dates persist (fr:stamps:v1) so a stamp keeps the day
 *     it was pressed even as the inputs keep growing.
 *   - Un-earned stamps are not paraded as a wall of grey circles — the
 *     three nearest to earning show as quiet "next up" lines.
 */

const DATE_KEY = "fr:stamps:v1";
const BP_KEY = "fr:beer-passport:v1";

const TONE: Record<StampTone, string> = {
  brand: "var(--app-brand-press)",
  spruce: "var(--app-brand-2)",
  gold: "var(--app-accent-press)",
};

/* Two tiny external stores, in the house useSyncExternalStore idiom
   (cached raw string → stable snapshot; storage events + explicit
   writes notify). Keeps renders pure and effects free of setState. */

const EMPTY_DATES: Record<string, string> = {};
let datesRaw: string | null = null;
let datesSnap: Record<string, string> = EMPTY_DATES;
const dateListeners = new Set<() => void>();

function readDates(): Record<string, string> {
  if (typeof window === "undefined") return EMPTY_DATES;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DATE_KEY);
  } catch {
    return datesSnap;
  }
  if (raw === datesRaw) return datesSnap;
  datesRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    datesSnap = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    datesSnap = {};
  }
  return datesSnap;
}

function writeDates(next: Record<string, string>) {
  try {
    window.localStorage.setItem(DATE_KEY, JSON.stringify(next));
  } catch {
    /* memory-only session: dates just won't persist */
  }
  datesRaw = null; // force re-read
  for (const l of dateListeners) l();
}

function subscribeDates(cb: () => void) {
  dateListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    dateListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

let bpRaw: string | null = null;
let bpCount = 0;

function readBreweryVisits(): number {
  if (typeof window === "undefined") return 0;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(BP_KEY);
  } catch {
    return bpCount;
  }
  if (raw === bpRaw) return bpCount;
  bpRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    bpCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    bpCount = 0;
  }
  return bpCount;
}

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function stampDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
    .toUpperCase()
    .replace(/,\s*(\d{2})$/, " ’$1");
}

/* ── Pictograms ────────────────────────────────────────────────────
   Every stamp carries a small line engraving, the way real park
   cancellation stamps do: Frederick's clustered spires, Brunswick's
   rails, Thurmont's peaks, a pint for the beer stamps. Drawn as plain
   stroke paths in the 100×100 stamp space, centered around (50,34);
   the ink filter roughens them into the pressed look. Static markup,
   no user input, so the innerHTML injection is safe. */
const ART: Record<string, string> = {
  "first-mark":
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path d="M25,22 h18 v28 l-9,-7.5 -9,7.5 z"/></g>',
  "the-dozen":
    '<g stroke="none">' +
    [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${19 + c * 10}" cy="${26 + r * 11}" r="2.6"/>`).join("")).join("") +
    "</g>",
  "boots-on":
    '<g stroke-linejoin="round" stroke-width="2.2"><path fill="none" d="M26,22 c9,-2.6 14,2.6 13,10 c-1.2,6 -4.8,8.6 -6,13.4 l-11.4,0 c-1.8,-7.4 -0.6,-16 4.4,-23.4 z"/><ellipse cx="28" cy="53" rx="5.6" ry="3.8" fill="none"/></g>',
  "ten-boots":
    '<g stroke-linejoin="round" stroke-width="2"><path fill="none" d="M18,26 c6.5,-1.9 10,1.9 9.4,7.2 c-0.9,4.4 -3.5,6.2 -4.4,9.7 l-8.2,0 c-1.3,-5.3 -0.4,-11.6 3.2,-16.9 z"/><ellipse cx="19.5" cy="48" rx="4" ry="2.8" fill="none"/><path fill="none" d="M40,28 c6.5,-1.9 10,1.9 9.4,7.2 c-0.9,4.4 -3.5,6.2 -4.4,9.7 l-8.2,0 c-1.3,-5.3 -0.4,-11.6 3.2,-16.9 z"/><ellipse cx="41.5" cy="50" rx="4" ry="2.8" fill="none"/></g>',
  "margin-writer":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path fill="none" d="M34,22 l11,13 c0,10 -6,14.5 -11,19 c-5,-4.5 -11,-9 -11,-19 z"/><path fill="none" d="M34,31 v11"/><circle cx="34" cy="45" r="1.9" stroke="none"/></g>',
  "on-tap":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path fill="none" d="M22,28 h22 l-2.8,26 h-16.4 z"/><circle cx="25" cy="25" r="4" stroke="none"/><circle cx="33" cy="23" r="4.6" stroke="none"/><circle cx="41" cy="25" r="4" stroke="none"/><path d="M28,36 v11 M37,36 v11" stroke-width="1.6" fill="none"/><path fill="none" d="M44,33 h3.5 a5,6 0 0 1 0,12 h-2.6" stroke-width="1.9"/></g>',
  "flight-six":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path fill="none" d="M14,26 h11 l-1.5,16 h-8 z M29.5,26 h11 l-1.5,16 h-8 z M45,26 h11 l-1.5,16 h-8 z"/><path fill="none" stroke-width="2.2" d="M12,50 h46"/></g>',
  "brewery-trail":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.1"><path fill="none" d="M34,20 c7.5,4.4 10.6,11.3 8.8,18.8 c-1.9,7.5 -5.6,11.3 -8.8,14.4 c-3.2,-3.1 -6.9,-6.9 -8.8,-14.4 c-1.9,-7.5 1.2,-14.4 8.8,-18.8 z"/><path fill="none" d="M34,24 v26 M27.5,31 c2,2.5 4.5,3.7 6.5,4.3 c2,-0.6 4.5,-1.8 6.5,-4.3 M27,39.5 c2.2,2.5 4.8,3.7 7,4.3 c2.2,-0.6 4.8,-1.8 7,-4.3" stroke-width="1.7"/></g>',
  "calendar-keeper":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><rect x="21" y="24" width="26" height="24" rx="2" fill="none"/><path fill="none" d="M21,32.5 h26 M28,24 v-5 M40,24 v-5"/><circle cx="34" cy="41.5" r="2.4" stroke="none"/></g>',
  "four-seasons":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><circle cx="34" cy="40" r="15" fill="none"/><path fill="none" d="M34,25 v30 M19,40 h30"/><circle cx="27" cy="33" r="1.8" stroke="none"/><circle cx="41" cy="33" r="1.8" stroke="none"/><circle cx="27" cy="47" r="1.8" stroke="none"/><circle cx="41" cy="47" r="1.8" stroke="none"/></g>',
  "full-county":
    '<g stroke-linejoin="round" stroke-width="2.2"><path fill="none" d="M34,26 l4.9,10.4 11.4,1.4 -8.4,7.9 2.1,11.3 -10,-5.6 -10,5.6 2.1,-11.3 -8.4,-7.9 11.4,-1.4 z"/></g>',
};
const TOWN_ART: Record<string, string> = {
  frederick:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path d="M18,58 v-12 l4,-7 4,7 v12"/><path d="M30,58 v-17 l4,-7 4,7 v17"/><path d="M42,58 v-11 l4,-6.5 4,6.5 v11"/><path d="M22,36 v-3.5 M34,31 v-3.5 M46,37.5 v-3.5"/><path d="M12,58 h44" stroke-width="1.6"/></g>',
  brunswick:
    '<g fill="none" stroke-linecap="round" stroke-width="2.2"><path d="M10,42 c16,-8 32,-8 48,0"/><path d="M10,54 c16,-8 32,-8 48,0"/><path d="M17,39.6 l-1.6,12 M25,36.8 l-0.9,12.3 M34,36 l0,12.4 M43,36.8 l0.9,12.3 M51,39.6 l1.6,12" stroke-width="1.7"/></g>',
  thurmont:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path d="M11,58 l14,-26 9,16 7,-12 15,22"/><path d="M22,45 l3,4 3,-4"/></g>',
  emmitsburg:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path d="M21,60 v-17 a13,13 0 0,1 26,0 v17"/><path d="M34,29 v-8 M29.5,24.8 h9"/><path d="M14,60 h40" stroke-width="1.6"/></g>',
};
const TOWN_DEFAULT =
  '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2.2"><path d="M20,60 v-14 l14,-11 14,11 v14 z"/><path d="M30,60 v-9 h8 v9"/><path d="M34,33 v-8 M30.5,27.8 h7"/></g>';

function artFor(key: string): string {
  if (ART[key]) return ART[key];
  if (key.startsWith("town-")) return TOWN_ART[key.slice(5)] ?? TOWN_DEFAULT;
  return TOWN_DEFAULT;
}

export function Stamp({ state, date, index }: { state: StampState; date: string; index: number }) {
  const { def } = state;
  const ink = TONE[def.tone];
  const arcId = `arc-${def.key}`;
  const longTitle = def.title.length > 12;
  const longSub = def.sub.length > 12;
  return (
    <figure
      className="stamp-press m-0"
      style={{ "--press-delay": `${Math.min(index, 10) * 85}ms` } as React.CSSProperties}
    >
      <svg
        viewBox="0 0 100 100"
        width={88}
        height={88}
        role="img"
        aria-label={`${def.title} stamp, earned ${date || "around here"}`}
      >
        <defs>
          {/* Top arc runs clockwise so the title reads upright; the bottom
              arc runs counter-clockwise so the second line does too. */}
          <path id={`${arcId}-t`} d="M 50,50 m -35,0 a 35,35 0 1,1 70,0" fill="none" />
          <path id={`${arcId}-b`} d="M 50,50 m -35,0 a 35,35 0 1,0 70,0" fill="none" />
        </defs>
        {/* One flat ink per seal: double ring, arc text, engraving, date. */}
        <g style={{ color: ink }} stroke="currentColor" fill="currentColor">
          <circle cx="50" cy="50" r="48" fill="none" strokeWidth="2" />
          <circle cx="50" cy="50" r="43.5" fill="none" strokeWidth="0.7" />
          <text
            fontSize={longTitle ? 7.6 : 8.4}
            fontWeight="700"
            letterSpacing={longTitle ? 0.6 : 1.6}
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            <textPath href={`#${arcId}-t`} startOffset="50%" textAnchor="middle">
              {def.title.toUpperCase()}
            </textPath>
          </text>
          <text
            fontSize="6.6"
            fontWeight="600"
            letterSpacing={longSub ? 0.5 : 1.2}
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            <textPath href={`#${arcId}-b`} startOffset="50%" textAnchor="middle">
              {def.sub.toUpperCase()}
            </textPath>
          </text>
          {/* Side pips where the two arc lines meet, the engraver's rest. */}
          <circle cx="12.5" cy="50" r="1.4" stroke="none" />
          <circle cx="87.5" cy="50" r="1.4" stroke="none" />
          {/* Line engraving, drawn in the legacy 68-unit space; scaled and
              centered here. Static markup, no user input. */}
          <g transform="translate(18.7, 2) scale(0.92)" dangerouslySetInnerHTML={{ __html: artFor(def.key) }} />
          <text
            x="50"
            y="66.5"
            textAnchor="middle"
            fontSize="6"
            fontWeight="700"
            letterSpacing="0.8"
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            {date || "COLLECTED"}
          </text>
        </g>
      </svg>
      <figcaption className="sr-only">{def.hint}</figcaption>
    </figure>
  );
}

export default function Passport({ placesBySlug }: { placesBySlug: Map<string, PlaceCardData> }) {
  const saved = useSavedList();
  const been = useBeenList();
  const notes = useAllNotes();
  // Brewery-passport visits live in their own store (written on /beer).
  const breweryVisits = useSyncExternalStore(subscribeStorage, readBreweryVisits, () => 0);

  const states = useMemo(
    () =>
      deriveStamps({
        saved,
        visited: been,
        notesCount: Object.keys(notes).length,
        breweryVisits,
        townOf: (slug) => placesBySlug.get(slug)?.municipality,
      }),
    [saved, been, notes, breweryVisits, placesBySlug],
  );

  // First-earned dates come from their own external store; the effect only
  // WRITES to it (store notification re-renders us), never sets state.
  const dates = useSyncExternalStore(subscribeDates, readDates, () => EMPTY_DATES);
  useEffect(() => {
    const now = new Date().toISOString();
    let changed = false;
    const next = { ...readDates() };
    for (const s of states) {
      if (s.earned && !next[s.def.key]) {
        next[s.def.key] = now;
        changed = true;
      }
    }
    if (changed) writeDates(next);
  }, [states]);

  const earned = states.filter((s) => s.earned);
  // "Next up": the closest un-earned stamps by remaining distance —
  // countable milestones first (they show real progress), never the
  // whole un-earned wall.
  const nextUp = states
    .filter((s) => !s.earned)
    .sort(
      (a, b) =>
        (a.progress.need - a.progress.done) / a.progress.need -
        (b.progress.need - b.progress.done) / b.progress.need,
    )
    .slice(0, 3);

  if (earned.length === 0 && saved.length === 0 && been.length === 0) return null;

  return (
    <section aria-label="Passport" className="space-y-3">
      <header className="flex items-baseline gap-2.5">
        <span
          aria-hidden
          className="block h-[3px] w-7 rounded-full"
          style={{ background: "var(--app-accent-press)" }}
        />
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-accent-press)" }}
        >
          Passport
        </h2>
        <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {earned.length} of {states.length}
        </span>
      </header>

      {/* The passport spread: an elevated paper plate with a ghost county
          seal watermarked behind the pressed stamps. */}
      <div
        className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] px-4 py-5"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 opacity-[0.05]"
          style={{ color: "var(--app-ink)", transform: "rotate(11deg)" }}
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" />
          <defs>
            <path id="seal-arc" d="M 50,50 m -33,0 a 33,33 0 1,1 66,0" fill="none" />
          </defs>
          <text fontSize="8.5" fontWeight="700" letterSpacing="2" fill="currentColor" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            <textPath href="#seal-arc" startOffset="50%" textAnchor="middle">FREDERICK COUNTY</textPath>
          </text>
          <text x="50" y="54" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            FIELD GUIDE
          </text>
        </svg>

        <p
          className="relative mb-3 font-serif text-[15px] italic"
          style={{ color: "var(--app-ink-2)" }}
        >
          These stamps mark what you have explored nearby.
        </p>

        {earned.length > 0 ? (
          <div className="relative grid grid-cols-3 justify-items-center gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
            {earned.map((s, i) => (
              <Stamp key={s.def.key} state={s} date={stampDay(dates[s.def.key] ?? "")} index={i} />
            ))}
          </div>
        ) : (
          <p className="relative max-w-[38ch] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Stamps press themselves as you use the guide: save a place, mark a visit, write a
            note. The first one is one save away.
          </p>
        )}
      </div>

      {nextUp.length > 0 && (
        <ul className="space-y-1.5 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          {nextUp.map((s) => (
            <li key={s.def.key} className="flex items-baseline gap-2.5 text-[12.5px]">
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 shrink-0 translate-y-[2px] rounded-full border border-dashed"
                style={{ borderColor: "var(--app-ink-tint-12, rgba(22,20,14,.25))" }}
              />
              <span style={{ color: "var(--app-ink-2)" }}>{s.def.hint}</span>
              {s.progress.need > 1 && (
                <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                  {s.progress.done} of {s.progress.need}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
