"use client";

import { Footprints, Bike, Car } from "lucide-react";
import type { TravelMode } from "@/lib/geo";

/**
 * RadiusPresets — one-tap chips that set BOTH the mode and the
 * minutes in a single gesture. Replaces the "pick a mode then move
 * the slider" two-step for the common cases:
 *
 *   • 5 min walk    — quick coffee run
 *   • 15 min walk   — downtown wander
 *   • 15 min bike   — neighborhoods radius
 *   • 30 min bike   — county-side ride
 *   • 10 min drive  — typical commute
 *   • 30 min drive  — full-county sweep
 *
 * The slider + mode buttons still live below for fine control; this
 * row is the one-tap path for the things people actually want.
 */

type Preset = {
  key: string;
  mode: TravelMode;
  minutes: number;
  label: string;
  blurb: string;
};

const PRESETS: Preset[] = [
  { key: "walk-5",  mode: "walk",  minutes: 5,  label: "5 min walk",  blurb: "Coffee run" },
  { key: "walk-15", mode: "walk",  minutes: 15, label: "15 min walk", blurb: "Downtown" },
  { key: "bike-15", mode: "bike",  minutes: 15, label: "15 min bike", blurb: "Neighborhood" },
  { key: "bike-30", mode: "bike",  minutes: 30, label: "30 min bike", blurb: "County-side" },
  { key: "drive-10", mode: "drive", minutes: 10, label: "10 min drive", blurb: "Quick errand" },
  { key: "drive-30", mode: "drive", minutes: 30, label: "30 min drive", blurb: "Full county" },
];

const MODE_ICON: Partial<Record<TravelMode, typeof Footprints>> = {
  walk: Footprints,
  bike: Bike,
  drive: Car,
};

const MODE_COLOR: Partial<Record<TravelMode, string>> = {
  walk: "var(--app-cool)",
  bike: "var(--app-brand-2)",
  drive: "var(--app-brand)",
};

export default function RadiusPresets({
  mode,
  minutes,
  onPick,
}: {
  mode: TravelMode;
  minutes: number;
  onPick: (mode: TravelMode, minutes: number) => void;
}) {
  return (
    <section aria-label="Quick presets" className="-mx-4 px-4">
      <div className="shelf-rail gap-2 pb-1">
          {PRESETS.map((p) => {
            const Icon = MODE_ICON[p.mode] ?? Footprints;
            const color = MODE_COLOR[p.mode] ?? "var(--app-cool)";
            const active = mode === p.mode && minutes === p.minutes;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPick(p.mode, p.minutes)}
                aria-pressed={active}
                className="group flex w-[140px] shrink-0 flex-col items-start gap-1 rounded-[var(--app-radius-md)] border p-2.5 text-left transition active:scale-[0.97]"
                style={{
                  borderColor: active ? color : "var(--app-border)",
                  background: active
                    ? `color-mix(in srgb, ${color} 14%, var(--app-bg-elevated))`
                    : "var(--app-bg-elevated)",
                  boxShadow: active ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    background: active
                      ? color
                      : `color-mix(in srgb, ${color} 16%, transparent)`,
                    color: active ? "white" : color,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <span
                  className="text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.label}
                </span>
                <span
                  className="text-[10.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {p.blurb}
                </span>
              </button>
            );
        })}
      </div>
    </section>
  );
}
