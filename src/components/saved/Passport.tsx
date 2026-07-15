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
 * Every stamp renders as a field-guide CANCELLATION stamp (the ink kind a
 * ranger presses into a national-park passport): a double ring, the title
 * bent around the top arc, the county line around the bottom, and the day
 * it was earned in the middle — speckled by an SVG turbulence filter and
 * set at a slightly-off rotation so no two press the same. Deliberately
 * not a badge, a trophy, or anything shiny.
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
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path d="M43,21 h14 v24 l-7,-6 -7,6 z"/></g>',
  "the-dozen":
    '<g stroke="none">' +
    [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${40 + c * 6.6}" cy="${25 + r * 7.2}" r="1.9"/>`).join("")).join("") +
    "</g>",
  "boots-on":
    '<g stroke-linejoin="round" stroke-width="2"><path fill="none" d="M44,20 c7,-2 11,2 10,8 c-1,5 -4,7 -5,11 l-9,0 c-1.5,-6 -0.5,-13 4,-19 z"/><ellipse cx="45.5" cy="45" rx="4.5" ry="3" fill="none"/></g>',
  "ten-boots":
    '<g stroke-linejoin="round" stroke-width="1.8"><path fill="none" d="M38,22 c5.5,-1.5 8.5,1.5 8,6 c-0.8,4 -3,5.5 -4,8.5 l-7,0 c-1.2,-4.5 -0.5,-10 3,-14.5 z"/><ellipse cx="39" cy="41" rx="3.5" ry="2.4" fill="none"/><path fill="none" d="M56,24 c5.5,-1.5 8.5,1.5 8,6 c-0.8,4 -3,5.5 -4,8.5 l-7,0 c-1.2,-4.5 -0.5,-10 3,-14.5 z"/><ellipse cx="57" cy="43" rx="3.5" ry="2.4" fill="none"/></g>',
  "margin-writer":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path fill="none" d="M50,19 l9,11 c0,8 -5,12 -9,16 c-4,-4 -9,-8 -9,-16 z"/><path fill="none" d="M50,27 v9"/><circle cx="50" cy="38" r="1.6" stroke="none"/></g>',
  "on-tap":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path fill="none" d="M42,26 h16 l-2,20 h-12 z"/><circle cx="44" cy="24" r="3" stroke="none"/><circle cx="50" cy="22.5" r="3.4" stroke="none"/><circle cx="56" cy="24" r="3" stroke="none"/><path d="M46,32 v8 M52,32 v8" stroke-width="1.4" fill="none"/></g>',
  "flight-six":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="1.8"><path fill="none" d="M34,24 h9 l-1.2,13 h-6.6 z M45.5,24 h9 l-1.2,13 h-6.6 z M57,24 h9 l-1.2,13 h-6.6 z"/><path fill="none" stroke-width="2" d="M32,43 h36"/></g>',
  "brewery-trail":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="1.9"><path fill="none" d="M50,19 c6,3.5 8.5,9 7,15 c-1.5,6 -4.5,9 -7,11.5 c-2.5,-2.5 -5.5,-5.5 -7,-11.5 c-1.5,-6 1,-11.5 7,-15 z"/><path fill="none" d="M50,22 v21 M45,28 c1.5,2 3.5,3 5,3.5 c1.5,-0.5 3.5,-1.5 5,-3.5 M44.5,35 c1.7,2 3.8,3 5.5,3.5 c1.7,-0.5 3.8,-1.5 5.5,-3.5"/></g>',
  "calendar-keeper":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><rect x="39" y="24" width="22" height="20" rx="1.5" fill="none"/><path fill="none" d="M39,31 h22 M45,24 v-4 M55,24 v-4"/><circle cx="50" cy="38" r="2" stroke="none"/></g>',
  "four-seasons":
    '<g stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><circle cx="50" cy="33" r="13" fill="none"/><path fill="none" d="M50,20 v26 M37,33 h26"/><circle cx="44" cy="27" r="1.5" stroke="none"/><circle cx="56" cy="27" r="1.5" stroke="none"/><circle cx="44" cy="39" r="1.5" stroke="none"/><circle cx="56" cy="39" r="1.5" stroke="none"/></g>',
  "full-county":
    '<g stroke-linejoin="round" stroke-width="2"><path fill="none" d="M50,19 l3.9,8.3 9.1,1.1 -6.7,6.3 1.7,9 -8,-4.5 -8,4.5 1.7,-9 -6.7,-6.3 9.1,-1.1 z"/></g>',
};
const TOWN_ART: Record<string, string> = {
  frederick:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path d="M38,46 v-9 l4,-7 4,7 v9"/><path d="M47,46 v-13 l3,-6 3,6 v13"/><path d="M57,46 v-8 l4,-6 4,6 v8"/><path d="M42,30 v-3 M50,27 v-3 M61,32 v-3"/></g>',
  brunswick:
    '<g fill="none" stroke-linecap="round" stroke-width="2"><path d="M32,36 c12,-5 24,-5 36,0"/><path d="M32,44 c12,-5 24,-5 36,0"/><path d="M37,34.6 l-1,7.4 M44,32.6 l-0.6,7.6 M50,32 l0,7.7 M56,32.6 l0.6,7.6 M63,34.6 l1,7.4" stroke-width="1.5"/></g>',
  thurmont:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path d="M34,46 l9,-16 6,10 5,-8 12,14"/><path d="M41,34 l2,3 2,-3"/></g>',
  emmitsburg:
    '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path d="M41,46 v-11 a9,9 0 0,1 18,0 v11"/><path d="M50,25 v-6 M46.8,21.8 h6.4"/></g>',
};
const TOWN_DEFAULT =
  '<g fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2"><path d="M41,46 v-10 l9,-7 9,7 v10 z"/><path d="M47,46 v-6 h6 v6"/><path d="M50,29 v-7 M47.5,24.5 h5"/></g>';

function artFor(key: string): string {
  if (ART[key]) return ART[key];
  if (key.startsWith("town-")) return TOWN_ART[key.slice(5)] ?? TOWN_DEFAULT;
  return TOWN_DEFAULT;
}

/** Perforated stamp outline: a rectangle with punched semicircle bites,
 *  the die-cut edge of a real postage stamp. Built once per geometry. */
function perfPath(w: number, h: number, r: number, step: number): string {
  const nx = Math.round(w / step);
  const ny = Math.round(h / step);
  let d = `M ${r},0 `;
  for (let i = 1; i < nx; i++) { const x = (w * i) / nx; d += `L ${(x - r).toFixed(1)},0 A ${r},${r} 0 0 0 ${(x + r).toFixed(1)},0 `; }
  d += `L ${w - r},0 A ${r},${r} 0 0 0 ${w},${r} `;
  for (let i = 1; i < ny; i++) { const y = (h * i) / ny; d += `L ${w},${(y - r).toFixed(1)} A ${r},${r} 0 0 0 ${w},${(y + r).toFixed(1)} `; }
  d += `L ${w},${h - r} A ${r},${r} 0 0 0 ${w - r},${h} `;
  for (let i = nx - 1; i > 0; i--) { const x = (w * i) / nx; d += `L ${(x + r).toFixed(1)},${h} A ${r},${r} 0 0 0 ${(x - r).toFixed(1)},${h} `; }
  d += `L ${r},${h} A ${r},${r} 0 0 0 0,${h - r} `;
  for (let i = ny - 1; i > 0; i--) { const y = (h * i) / ny; d += `L 0,${(y + r).toFixed(1)} A ${r},${r} 0 0 0 0,${(y - r).toFixed(1)} `; }
  return d + `L 0,${r} A ${r},${r} 0 0 0 ${r},0 Z`;
}
const SW = 68; // stamp width in local units
const SH = 82; // stamp height
const PERF = perfPath(SW, SH, 2.1, 6.8);

/** Deterministic per-key hash → stable "hand-pressed" irregularity:
 *  rotation, a small vertical drift, and a slight size variance, so the
 *  spread reads organically stamped rather than laid out on a grid. */
function hashOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function tilt(key: string): number {
  return ((hashOf(key) % 13) - 6) * 0.9;
}
function drift(key: string): number {
  return ((hashOf(key + "y") % 9) - 4) * 1.6;
}
function sizeOf(key: string): number {
  return 86 + (hashOf(key + "s") % 12);
}

function Stamp({ state, date, index }: { state: StampState; date: string; index: number }) {
  const { def } = state;
  const ink = TONE[def.tone];
  const fid = `pm-${def.key}`;
  const seed = (hashOf(def.key) % 11) + 3;
  const w = sizeOf(def.key);
  const h = Math.round((w * (SH + 12)) / (SW + 12));
  const [d1, d2] = date ? [date.replace(/ ’\d+$/, ""), "2026"] : ["EARNED", "HERE"];
  const longTitle = def.title.length > 11;
  return (
    <figure
      className="stamp-press m-0"
      style={{
        transform: `rotate(${tilt(def.key)}deg) translateY(${drift(def.key)}px)`,
        marginInline: "-2px",
        filter: "drop-shadow(0 2px 3px rgba(22,20,14,.22))",
        "--press-delay": `${Math.min(index, 10) * 85}ms`,
      } as React.CSSProperties}
    >
      <svg
        viewBox={`-6 -6 ${SW + 12} ${SH + 12}`}
        width={w}
        height={h}
        role="img"
        aria-label={`${def.title} stamp, earned ${date || "around here"}`}
      >
        <defs>
          {/* ink erosion for the postmark strike only — the stamp itself
              stays crisp, the way print sits under a hand cancellation */}
          <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed={seed} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 -0.25" result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
          </filter>
        </defs>
        {/* stamp paper with die-cut perforations */}
        <path d={PERF} fill="var(--app-paper, #FCF8EE)" stroke="var(--app-ink-tint-12, rgba(22,20,14,.14))" strokeWidth="0.5" />
        {/* engraved frame + tablets + vignette, in the stamp's ink */}
        <g style={{ color: ink }} stroke="currentColor" fill="currentColor">
          <rect x="4.5" y="4.5" width={SW - 9} height={SH - 9} fill="none" strokeWidth="1.4" />
          <rect x="7" y="7" width={SW - 14} height={SH - 14} fill="none" strokeWidth="0.5" />
          <text
            x={SW / 2}
            y="13.5"
            textAnchor="middle"
            fontSize={longTitle ? 4.7 : 5.6}
            fontWeight="700"
            letterSpacing={longTitle ? 0.7 : 1.1}
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            {def.title.toUpperCase()}
          </text>
          <path d={`M10,16.5 h${SW - 20}`} strokeWidth="0.5" />
          <g transform="translate(-1.6,17) scale(0.71)" dangerouslySetInnerHTML={{ __html: artFor(def.key) }} />
          <path d={`M10,${SH - 16} h${SW - 20}`} strokeWidth="0.5" />
          <text
            x={SW / 2}
            y={SH - 9.5}
            textAnchor="middle"
            fontSize="4.4"
            fontWeight="600"
            letterSpacing="0.8"
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            {def.sub.toUpperCase()}
          </text>
        </g>
        {/* the cancellation: earning IS the postmark, struck over the corner */}
        <g
          filter={`url(#${fid})`}
          stroke="var(--app-ink-2, #423E34)"
          fill="var(--app-ink-2, #423E34)"
          opacity="0.78"
          transform={`rotate(-10 ${SW - 4} 6)`}
        >
          <circle cx={SW - 4} cy="6" r="11.5" fill="none" strokeWidth="1.3" />
          <text x={SW - 4} y="4.6" textAnchor="middle" fontSize="4.4" fontWeight="700" letterSpacing="0.4" stroke="none" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {d1}
          </text>
          <text x={SW - 4} y="10.2" textAnchor="middle" fontSize="4.4" fontWeight="700" stroke="none" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            {d2}
          </text>
          <path d={`M ${SW - 26},16 q 8,3 22,3 M ${SW - 28},20.5 q 10,3 26,2.6`} fill="none" strokeWidth="1.1" />
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
          Earned around here.
        </p>

        {earned.length > 0 ? (
          <div className="relative flex flex-wrap items-center justify-start gap-y-4 pl-1">
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
