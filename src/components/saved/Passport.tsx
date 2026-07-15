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
  return 88 + (hashOf(key + "s") % 14);
}

function Stamp({ state, date, index }: { state: StampState; date: string; index: number }) {
  const { def } = state;
  const ink = TONE[def.tone];
  const fid = `ink-${def.key}`;
  const seed = Math.abs(tilt(def.key) * 7) + 2;
  const size = sizeOf(def.key);
  return (
    <figure
      className="stamp-press m-0 flex flex-col items-center"
      style={{
        transform: `rotate(${tilt(def.key)}deg) translateY(${drift(def.key)}px)`,
        marginInline: "-4px",
        "--press-delay": `${Math.min(index, 10) * 85}ms`,
      } as React.CSSProperties}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`${def.title} stamp, earned ${date || "around here"}`}
        style={{ color: ink }}
      >
        <defs>
          {/* Ink erosion: turbulence eats tiny bites out of every stroke so
              the stamp reads pressed, not printed. */}
          <filter id={fid} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={seed} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.18" result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
          </filter>
          <path id={`arc-t-${def.key}`} d="M 50,50 m -35,0 a 35,35 0 1,1 70,0" fill="none" />
          <path id={`arc-b-${def.key}`} d="M 50,50 m -35,0 a 35,35 0 1,0 70,0" fill="none" />
        </defs>
        <g filter={`url(#${fid})`} fill="currentColor" stroke="currentColor" opacity="0.92">
          <circle cx="50" cy="50" r="47" fill="none" strokeWidth="2.4" />
          <circle cx="50" cy="50" r="43" fill="none" strokeWidth="0.9" />
          {/* rim text */}
          <text fontSize="9.5" fontWeight="700" letterSpacing="1.6" stroke="none" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            <textPath href={`#arc-t-${def.key}`} startOffset="50%" textAnchor="middle">
              {def.title.toUpperCase()}
            </textPath>
          </text>
          <text fontSize="6" fontWeight="600" letterSpacing="1.3" stroke="none" style={{ fontFamily: "var(--font-mono, ui-monospace)" }}>
            <textPath href={`#arc-b-${def.key}`} startOffset="50%" textAnchor="middle">
              {def.sub.toUpperCase()}
            </textPath>
          </text>
          {/* center plate: separators + earned day */}
          <path d="M 30,42 h 40" strokeWidth="0.8" />
          <path d="M 30,58 h 40" strokeWidth="0.8" />
          <circle cx="23.5" cy="50" r="1.3" stroke="none" />
          <circle cx="76.5" cy="50" r="1.3" stroke="none" />
          <text
            x="50"
            y="53.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            letterSpacing="0.6"
            stroke="none"
            style={{ fontFamily: "var(--font-mono, ui-monospace)" }}
          >
            {date || "EARNED"}
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
