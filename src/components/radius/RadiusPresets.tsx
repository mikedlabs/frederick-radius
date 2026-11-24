"use client";

import type { TravelMode } from "@/lib/geo";

const PRESETS = [
  { mode: "walk", minutes: 5, label: "5 min walk" },
  { mode: "walk", minutes: 15, label: "15 min walk" },
  { mode: "bike", minutes: 15, label: "15 min bike" },
  { mode: "bike", minutes: 30, label: "30 min bike" },
  { mode: "drive", minutes: 10, label: "10 min drive" },
  { mode: "drive", minutes: 30, label: "30 min drive" },
] as const;

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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick presets">
      {PRESETS.map((preset) => {
        const active = mode === preset.mode && minutes === preset.minutes;
        return (
          <button
            key={`${preset.mode}-${preset.minutes}`}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(preset.mode, preset.minutes)}
            className="min-h-11 rounded-[var(--app-radius-md)] border border-[var(--app-control-border)] px-3 text-sm font-semibold"
            style={{
              color: active ? "var(--app-bg)" : "var(--app-ink)",
              background: active ? "var(--app-ink)" : "var(--app-bg)",
            }}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
