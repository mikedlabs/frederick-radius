"use client";

import { useState } from "react";

/**
 * RadiusRing — the product's NAMESAKE and signature interaction (redesign
 * brief: "the one element a first-time user remembers"). A walk-time ring
 * at 5 / 10 / 15 minutes, centered on you or a dropped pin, switchable
 * between the three sizes; when active, results filter to what's inside.
 *
 * This is the reviewable primitive + its 5/10/15 control. Wiring it onto
 * the live Mapbox canvas (it already exists in RadiusMap.tsx) is Phase 3.
 * Concentric contour bands echo the field-guide plate so the ring reads as
 * FrederickRadius even with the color stripped (the anti-template test).
 */
const SIZES = [5, 10, 15] as const;
type Mins = (typeof SIZES)[number];

export default function RadiusRing({
  initial = 10,
  diameter = 220,
}: {
  initial?: Mins;
  diameter?: number;
}) {
  const [mins, setMins] = useState<Mins>(initial);
  // Visual radius scales with minutes (5→52%, 10→74%, 15→96% of the box)
  // so changing the selector visibly grows/shrinks the ring.
  const pct = mins === 5 ? 0.52 : mins === 10 ? 0.74 : 0.96;
  const r = (diameter / 2) * pct;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative grid place-items-center rounded-[var(--app-radius-lg)]"
        style={{
          width: diameter,
          height: diameter,
          background:
            "radial-gradient(120% 120% at 50% 30%, var(--app-bg-elevated-solid), var(--app-bg-sunken))",
          boxShadow: "var(--app-edge), var(--app-elev-2)",
          overflow: "hidden",
        }}
      >
        {/* contour bands — field-guide plate echo */}
        <svg
          aria-hidden
          viewBox="0 0 240 240"
          className="absolute inset-0 h-full w-full"
          style={{ color: "var(--app-sage)", opacity: 0.22 }}
          fill="none"
          stroke="currentColor"
        >
          {[28, 52, 78, 104].map((rr) => (
            <circle key={rr} cx="120" cy="120" r={rr} strokeWidth="0.75" />
          ))}
        </svg>
        {/* the active walk-time ring */}
        <span
          className="absolute rounded-full transition-all duration-300"
          style={{
            width: r * 2,
            height: r * 2,
            border: "2px solid var(--app-cool)",
            background: "color-mix(in srgb, var(--app-cool) 9%, transparent)",
            boxShadow: "0 0 0 1px color-mix(in srgb, var(--app-cool) 30%, transparent)",
          }}
        />
        {/* center dot (you / dropped pin) */}
        <span
          className="absolute h-3 w-3 rounded-full"
          style={{ background: "var(--app-cool)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--app-cool) 22%, transparent)" }}
        />
        <span
          className="absolute t-meta font-mono tabular-nums"
          style={{
            color: "var(--app-cool)",
            transform: `translateY(${-r + 14}px)`,
          }}
        >
          {mins} min walk
        </span>
      </div>

      {/* 5 / 10 / 15 selector */}
      <div
        className="inline-flex rounded-full p-1"
        style={{ background: "var(--app-bg-sunken)", boxShadow: "var(--app-edge)" }}
      >
        {SIZES.map((s) => {
          const on = s === mins;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setMins(s)}
              className="t-meta t-semibold rounded-full px-3.5 py-1.5 font-mono tabular-nums transition-colors"
              style={{
                background: on ? "var(--app-cool)" : "transparent",
                color: on ? "#fff" : "var(--app-ink-2)",
              }}
              aria-pressed={on}
            >
              {s} min
            </button>
          );
        })}
      </div>
    </div>
  );
}
