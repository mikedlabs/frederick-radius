"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
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
 * Each key is lit Ink on the Cream page: the one place in the product where
 * the dark surface earns itself, because an instrument panel is exactly the
 * "rare contrast moment" the brand reserves Ink for. The face carries an icon,
 * one reading, and one label. Nothing else. A key that has a second honest
 * reading rotates to it rather than stacking both.
 *
 * Motion: faces cross-fade on a shared tick, staggered into three groups so
 * the board breathes instead of flashing in unison. prefers-reduced-motion
 * pins every key to its first face.
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

function KeyFace({ deckKey, faceIndex }: { deckKey: DeckKey; faceIndex: number }) {
  const face = deckKey.faces[faceIndex % deckKey.faces.length];
  const unavailable = deckKey.status === "unavailable";
  const Icon = ICONS[deckKey.icon];

  return (
    <>
      <span className="flex items-start justify-between">
        <Icon
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={2.25}
          style={{ color: unavailable ? "rgba(244,238,226,0.32)" : deckKey.accent }}
          aria-hidden
        />
        {deckKey.live && !unavailable && (
          <span
            aria-hidden
            className="fr-deck-live mt-[3px] h-[5px] w-[5px] shrink-0 rounded-full"
            style={{ background: deckKey.accent }}
          />
        )}
      </span>

      <span className="mt-auto block min-w-0">
        {/* The reading. Keyed on the face so a change re-runs the fade. */}
        <span
          key={`${deckKey.id}-${faceIndex}`}
          className="fr-deck-value block truncate font-semibold tabular-nums leading-none"
          style={{
            fontSize: "clamp(19px, 5.4vw, 27px)",
            letterSpacing: "-0.02em",
            color: unavailable ? "rgba(244,238,226,0.45)" : "var(--app-bg)",
          }}
        >
          {face.value}
        </span>
        <span
          key={`${deckKey.id}-${faceIndex}-label`}
          className="fr-deck-label mt-1 block truncate text-[10.5px] leading-tight"
          style={{ color: "rgba(244,238,226,0.62)" }}
        >
          {face.label}
        </span>
      </span>
    </>
  );
}

export default function DeckBoard({ keys }: { keys: DeckKey[] }) {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const [tick, setTick] = useState(0);
  const rotates = keys.some((deckKey) => deckKey.faces.length > 1);

  useEffect(() => {
    if (reduced || !rotates) return;
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [reduced, rotates]);

  if (keys.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {keys.map((deckKey, index) => {
        // Three across leaves a lone key stranded whenever the count is 3n+1.
        // The last one widens into a full-width key rather than sitting in a
        // half-empty row; five across divides evenly and needs no help.
        const wide = keys.length % 3 === 1 && index === keys.length - 1;
        // Three stagger groups: neighbouring keys never turn on the same tick.
        const phase = index % FACE_TICKS;
        const faceIndex = reduced
          ? 0
          : Math.floor((tick + phase) / FACE_TICKS) % deckKey.faces.length;
        const unavailable = deckKey.status === "unavailable";
        // Every face at once, so a screen reader is never waiting on a timer
        // to hear a reading the page is currently showing.
        const readings = deckKey.faces
          .map((face) => `${face.value} ${face.label}`)
          .join(", ");

        return (
          <Link
            key={deckKey.id}
            href={deckKey.href}
            aria-label={`${deckKey.name}: ${readings}. Source: ${deckKey.source}.`}
            className={`fr-deck-key relative flex flex-col overflow-hidden p-2.5 sm:aspect-square sm:p-3 ${
              wide ? "col-span-3 aspect-[3.4/1] sm:col-span-1" : "aspect-square"
            }`}
            style={{
              borderRadius: "var(--app-radius-md)",
              background: "var(--app-ink)",
              opacity: unavailable ? 0.62 : 1,
            }}
          >
            {/* The backlight: the key's own accent, thrown from behind the icon. */}
            {!unavailable && (
              <span
                aria-hidden
                className="pointer-events-none absolute -left-6 -top-8 h-20 w-20 rounded-full"
                style={{
                  background: deckKey.accent,
                  opacity: 0.22,
                  filter: "blur(22px)",
                }}
              />
            )}
            {/* Top edge highlight — the lit-key bevel, not a border. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "rgba(244,238,226,0.16)" }}
            />
            <span className="relative flex h-full flex-col" aria-hidden>
              <KeyFace deckKey={deckKey} faceIndex={faceIndex} />
            </span>
          </Link>
        );
      })}

      <style>{`
        .fr-deck-key {
          transition: transform 140ms ease, box-shadow 140ms ease;
          box-shadow: 0 1px 0 rgba(34,28,21,0.10), 0 6px 14px -10px rgba(34,28,21,0.55);
        }
        .fr-deck-key:active { transform: translateY(1px) scale(0.985); }
        @media (hover: hover) {
          .fr-deck-key:hover { transform: translateY(-1px); box-shadow: 0 2px 0 rgba(34,28,21,0.10), 0 12px 22px -12px rgba(34,28,21,0.6); }
        }
        .fr-deck-value, .fr-deck-label { animation: fr-deck-in 420ms ease both; }
        .fr-deck-label { animation-delay: 40ms; }
        @keyframes fr-deck-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        .fr-deck-live { animation: fr-deck-pulse 2.6s ease-in-out infinite; }
        @keyframes fr-deck-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fr-deck-value, .fr-deck-label, .fr-deck-live { animation: none !important; }
          .fr-deck-key { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
