"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bus,
  CalendarDays,
  Car,
  CloudSun,
  GraduationCap,
  Newspaper,
  Plug,
  TrainFront,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DeckIcon, DeckKey } from "@/lib/deck/readings";

/**
 * The deck — the county's instruments as a board of keys.
 *
 * Closed, a key is a reading: an icon, one value, one label. Pressed, it
 * opens IN PLACE, widening across the board to reveal the rows behind that
 * number and the surface that owns them. Deliberately not a popup: the
 * number you pressed stays on screen with its evidence beneath it, and the
 * rest of the board stays visible around it.
 *
 * The keys are paper, not dark slabs. An earlier build lit these in Ink on
 * the argument that an instrument panel is the brand's "rare contrast
 * moment"; ten at once was a black grid dropped onto a warm page, which is a
 * page theme by another name. Identity now comes from each key's accent
 * washed across the face and a stripe on its top edge, so the reading stays
 * Ink on paper where it is easiest to read.
 *
 * Motion: closed faces cross-fade on a shared tick, staggered into three
 * groups so the board breathes instead of flashing in unison. An open key
 * stops rotating, because a panel that changes its own heading while you
 * read it is hostile. prefers-reduced-motion pins every key to its first
 * face and drops the open animation.
 */

const ICONS: Record<DeckIcon, LucideIcon> = {
  bus: Bus,
  train: TrainFront,
  car: Car,
  plug: Plug,
  cloud: CloudSun,
  waves: Waves,
  school: GraduationCap,
  wrench: Wrench,
  calendar: CalendarDays,
  newspaper: Newspaper,
};

const TICK_MS = 2_400;
/** Ticks a face holds before the next one takes over. */
const FACE_TICKS = 3;

function faceOf(deckKey: DeckKey, index: number) {
  return deckKey.faces[index % deckKey.faces.length];
}

export default function DeckBoard({ keys }: { keys: DeckKey[] }) {
  const panelBase = useId();
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const rotates = keys.some((deckKey) => deckKey.faces.length > 1);

  useEffect(() => {
    if (reduced || !rotates) return;
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [reduced, rotates]);

  // Escape closes the open key, the same as pressing it again.
  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  if (keys.length === 0) return null;

  return (
    // Dense flow so the full-width open key does not strand empty cells in the
    // row above it: the keys that follow backfill the gap instead.
    <div className="grid grid-flow-dense grid-cols-3 gap-2 sm:grid-cols-5">
      {keys.map((deckKey, index) => {
        const open = openId === deckKey.id;
        const unavailable = deckKey.status === "unavailable";
        const Icon = ICONS[deckKey.icon];
        const panelId = `${panelBase}-${deckKey.id}`;

        // Three stagger groups: neighbouring keys never turn on the same tick.
        // An open key holds its first face so its heading stays still.
        const phase = index % FACE_TICKS;
        const faceIndex =
          reduced || open ? 0 : Math.floor((tick + phase) / FACE_TICKS) % deckKey.faces.length;
        const face = faceOf(deckKey, faceIndex);

        // Three across leaves a lone key stranded whenever the count is 3n+1.
        // The last one widens rather than sitting in a half-empty row; five
        // across divides evenly and needs no help.
        const wide = keys.length % 3 === 1 && index === keys.length - 1;

        // Every face at once, so a screen reader is never waiting on a timer
        // to hear a reading the page is currently showing.
        const readings = deckKey.faces.map((f) => `${f.value} ${f.label}`).join(", ");

        return (
          <div
            key={deckKey.id}
            className={
              open
                ? "col-span-3 sm:col-span-5"
                : wide
                  ? "col-span-3 sm:col-span-1"
                  : "col-span-1"
            }
          >
            <div
              className="fr-deck-key relative overflow-hidden"
              style={{
                borderRadius: "var(--app-radius-md)",
                background: "var(--app-bg-elevated-solid)",
                border: "1px solid var(--app-border)",
                opacity: unavailable && !open ? 0.72 : 1,
              }}
            >
              {/* The key's own colour, washed from the corner the icon sits in.
                  Light enough that Ink text keeps full contrast. */}
              {!unavailable && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(120% 90% at 0% 0%, ${deckKey.accent} 0%, transparent 72%)`,
                    opacity: 0.16,
                  }}
                />
              )}
              {/* A colour stripe on the top edge so a key is identifiable at a
                  glance, and at a distance, without reading it. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
                style={{
                  background: unavailable ? "var(--app-border)" : deckKey.accent,
                  opacity: unavailable ? 1 : 0.85,
                }}
              />

              <button
                type="button"
                onClick={() => setOpenId(open ? null : deckKey.id)}
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`${deckKey.name}: ${readings}. ${open ? "Hide" : "Show"} detail.`}
                className={`fr-deck-press relative flex w-full flex-col p-2.5 text-left sm:p-3 ${
                  open ? "" : wide ? "aspect-[3.4/1] sm:aspect-square" : "aspect-square"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <Icon
                    className="h-[18px] w-[18px] shrink-0"
                    strokeWidth={2.25}
                    style={{ color: unavailable ? "var(--app-ink-3)" : deckKey.accent }}
                    aria-hidden
                  />
                  {open ? (
                    <span
                      className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: "var(--app-ink-3)" }}
                      aria-hidden
                    >
                      {deckKey.name}
                    </span>
                  ) : (
                    deckKey.live &&
                    !unavailable && (
                      <span
                        aria-hidden
                        className="fr-deck-live mt-[3px] h-[5px] w-[5px] shrink-0 rounded-full"
                        style={{ background: deckKey.accent }}
                      />
                    )
                  )}
                </span>

                <span className={open ? "mt-2 block min-w-0" : "mt-auto block min-w-0"} aria-hidden>
                  <span
                    key={`${deckKey.id}-${faceIndex}`}
                    className="fr-deck-value block truncate font-semibold tabular-nums leading-none"
                    style={{
                      fontSize: "clamp(19px, 5.4vw, 27px)",
                      letterSpacing: "-0.02em",
                      color: unavailable ? "var(--app-ink-3)" : "var(--app-ink)",
                    }}
                  >
                    {face.value}
                  </span>
                  <span
                    key={`${deckKey.id}-${faceIndex}-label`}
                    className="fr-deck-label mt-1 block truncate text-[10.5px] leading-tight"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {face.label}
                  </span>
                </span>
              </button>

              {/* The reveal. Rendered only when open so a collapsed board never
                  ships ten hidden panels to the accessibility tree. */}
              {open && (
                <div id={panelId} className="fr-deck-panel relative px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                  {deckKey.detail.length > 0 ? (
                    <ul
                      className="border-t"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      {deckKey.detail.map((row, rowIndex) => (
                        <li
                          key={`${row.lead}-${rowIndex}`}
                          className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0"
                          style={{ borderColor: "var(--app-border)" }}
                        >
                          <span
                            className="min-w-0 flex-1 text-[13px] leading-snug"
                            style={{ color: "var(--app-ink)" }}
                          >
                            {row.lead}
                          </span>
                          {row.trail && (
                            <span
                              className="shrink-0 font-mono text-[11px] tabular-nums"
                              style={{ color: "var(--app-ink-3)" }}
                            >
                              {row.trail}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      className="border-t pt-2 text-[13px] leading-relaxed"
                      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                    >
                      {deckKey.note ?? "Nothing to list for this reading."}
                    </p>
                  )}

                  {deckKey.detail.length > 0 && deckKey.note && (
                    <p className="pt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                      {deckKey.note}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span
                      className="min-w-0 truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {deckKey.source}
                    </span>
                    <Link
                      href={deckKey.href}
                      className="tap-44-y inline-flex shrink-0 items-center gap-1 text-[13px] font-medium"
                      // Brick at 13px is 3.24:1 on cream. The pressed tone is
                      // the AA-passing text variant (4.80:1).
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      {deckKey.hrefLabel}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <style>{`
        .fr-deck-key {
          transition: box-shadow 140ms ease;
          box-shadow: 0 1px 2px rgba(34,28,21,0.05), 0 4px 10px -8px rgba(34,28,21,0.28);
        }
        .fr-deck-press { transition: transform 140ms ease; }
        .fr-deck-press:active { transform: scale(0.985); }
        @media (hover: hover) {
          .fr-deck-key:hover { box-shadow: 0 2px 4px rgba(34,28,21,0.06), 0 12px 20px -12px rgba(34,28,21,0.34); }
        }
        .fr-deck-value, .fr-deck-label { animation: fr-deck-in 420ms ease both; }
        .fr-deck-label { animation-delay: 40ms; }
        /* Never dips to zero. A reading that blinks out, even for 200ms, reads
           as the feed dropping rather than as the face turning over. */
        @keyframes fr-deck-in {
          from { opacity: 0.3; transform: translateY(3px); }
          to { opacity: 1; transform: none; }
        }
        .fr-deck-panel { animation: fr-deck-open 220ms ease both; }
        @keyframes fr-deck-open {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        .fr-deck-live { animation: fr-deck-pulse 2.6s ease-in-out infinite; }
        @keyframes fr-deck-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fr-deck-value, .fr-deck-label, .fr-deck-live, .fr-deck-panel { animation: none !important; }
          .fr-deck-key, .fr-deck-press { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
