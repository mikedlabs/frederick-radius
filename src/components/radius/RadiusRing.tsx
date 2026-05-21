"use client";

import { Footprints, Bike, Car, MapPin, Navigation } from "lucide-react";
import type { TravelMode } from "@/lib/geo";
import { formatDistance } from "@/lib/geo";

/**
 * RadiusRing — the new visual hero for /radius. An SVG showing the
 * center pin, three concentric distance markers, and the edge place
 * labeled on the outer ring. Animates as the slider moves so the
 * page reads as one live diagram instead of a bunch of stat blocks.
 *
 * Sized for mobile-first (300px square, fluid). Pure SVG; no canvas
 * or runtime deps. Works in dark and light mode through CSS vars.
 */

// Only the three travel modes the radius slider uses. "distance" is
// in the TravelMode union for metersToMinutes() but isn't exposed in
// the UI, so we use a Partial map and fall back where needed.
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

export default function RadiusRing({
  mode,
  minutes,
  meters,
  centerLabel,
  edge,
  countInside,
}: {
  mode: TravelMode;
  minutes: number;
  meters: number;
  centerLabel: string;
  edge: { name: string; distance_m: number; bearing?: number } | null;
  countInside: number;
}) {
  const Icon = MODE_ICON[mode] ?? Footprints;
  const accent = MODE_COLOR[mode] ?? "var(--app-cool)";

  // Compute the outer ring's apparent radius as a fraction of the
  // SVG canvas (220 unit half-width). We scale linearly with the
  // configured minutes (3 → 30) so a 5-minute walk visibly differs
  // from a 30-minute drive.
  const MAX_MIN = 30;
  const ringFrac = Math.min(1, Math.max(0.18, minutes / MAX_MIN));
  const R_OUTER = ringFrac * 180; // out of 220 viewport half-width
  const R_MID = R_OUTER * 0.66;
  const R_INNER = R_OUTER * 0.33;

  // The edge place's compass position on the outer ring. If we don't
  // have a bearing, plant it at 2 o'clock (135° in SVG y-down coords).
  const bearingDeg = edge?.bearing ?? 60;
  const rad = ((bearingDeg - 90) * Math.PI) / 180;
  const edgeX = 220 + Math.cos(rad) * R_OUTER;
  const edgeY = 220 + Math.sin(rad) * R_OUTER;

  return (
    <section
      aria-label="Radius preview"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Soft mode-tinted backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 110% at 50% 0%, color-mix(in srgb, ${accent} 18%, transparent), transparent 60%)`,
        }}
      />
      {/* SVG ring */}
      <div className="relative px-4 pt-4 pb-3">
        <svg
          viewBox="0 0 440 360"
          className="w-full"
          role="img"
          aria-label={`${minutes} minute ${mode} radius`}
        >
          {/* Concentric rings */}
          {[R_INNER, R_MID, R_OUTER].map((r, i) => (
            <circle
              key={i}
              cx={220}
              cy={220}
              r={r}
              fill="none"
              stroke={accent}
              strokeWidth={i === 2 ? 2 : 1}
              strokeOpacity={i === 2 ? 0.55 : 0.22}
              strokeDasharray={i === 2 ? undefined : "4 6"}
              style={{
                transition: "r 320ms var(--app-ease-spring)",
              }}
            />
          ))}
          {/* Outer ring soft glow */}
          <circle
            cx={220}
            cy={220}
            r={R_OUTER}
            fill={accent}
            opacity={0.06}
            style={{ transition: "r 320ms var(--app-ease-spring)" }}
          />
          {/* Center pin — circle + drop tail */}
          <g>
            <circle
              cx={220}
              cy={220}
              r={11}
              fill={accent}
              stroke="white"
              strokeWidth={2.5}
            />
            <circle cx={220} cy={220} r={3} fill="white" />
          </g>
          {/* Edge place dot — only when we know one */}
          {edge && (
            <g
              style={{
                transition:
                  "transform 320ms var(--app-ease-spring), opacity 220ms ease",
              }}
            >
              <circle
                cx={edgeX}
                cy={edgeY}
                r={6}
                fill="white"
                stroke={accent}
                strokeWidth={2}
              />
              {/* Connection line from pin to edge */}
              <line
                x1={220}
                y1={220}
                x2={edgeX}
                y2={edgeY}
                stroke={accent}
                strokeWidth={1}
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
            </g>
          )}
        </svg>
        {/* Center pin label — overlay so absolute positioning matches the SVG */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
            style={{
              background: "color-mix(in srgb, var(--app-bg-elevated) 90%, transparent)",
              color: "var(--app-ink-2)",
              backdropFilter: "blur(4px)",
              transform: "translateY(28px)",
            }}
          >
            <MapPin className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            {centerLabel}
          </span>
        </div>
      </div>
      {/* Stat bar — mode icon + minutes + edge place name + count */}
      <div
        className="flex items-stretch border-t"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex flex-1 items-center gap-2.5 px-4 py-2.5">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${accent} 18%, transparent)`,
              color: accent,
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {mode === "walk" ? "Walking" : mode === "bike" ? "Biking" : "Driving"}
            </p>
            <p
              className="font-serif text-[18px] font-semibold leading-tight tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {minutes} min
              <span className="ml-1.5 text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                · {formatDistance(meters)}
              </span>
            </p>
          </div>
        </div>
        <div
          className="flex flex-1 items-center gap-2.5 border-l px-4 py-2.5"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <Navigation className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              In range
            </p>
            <p
              className="font-serif text-[18px] font-semibold leading-tight tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {countInside.toLocaleString()}
              <span className="ml-1.5 text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
                place{countInside === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
      </div>
      {edge && (
        <p
          className="border-t px-4 py-2 text-[11.5px] truncate"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          At the edge:{" "}
          <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>
            {edge.name}
          </span>{" "}
          <span className="tabular-nums">· {formatDistance(edge.distance_m)} away</span>
        </p>
      )}
    </section>
  );
}
