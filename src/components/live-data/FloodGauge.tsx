import type { FloodCategory, FloodStages } from "@/lib/integrations/floodStage";

/**
 * FloodGauge — a range-anchored bar that places the live gage height across
 * the NWS flood categories (normal · action · minor · moderate · major), so a
 * reading reads as "how close to flooding," not just a bare number.
 *
 * Field-guide, not a dashboard rainbow: the zones escalate calm → hot using
 * brand tokens only (slate → gold → warning → vermilion → deep), a single
 * semantic ramp where color encodes danger (the way NWS hydrographs do). A
 * thin ink tick marks the current level; the precise numbers live in a mono
 * caption below. Pure + presentational (server-safe).
 */

const ZONE_FILL: Record<string, string> = {
  normal: "color-mix(in srgb, var(--app-cool) 22%, var(--app-bg-elevated))",
  action: "color-mix(in srgb, var(--app-accent) 48%, var(--app-bg-elevated))",
  minor: "color-mix(in srgb, var(--app-warning) 62%, var(--app-bg-elevated))",
  moderate: "color-mix(in srgb, var(--app-brand) 72%, var(--app-bg-elevated))",
  major: "var(--app-brand-press)",
};

const CATEGORY_INK: Record<string, string> = {
  normal: "var(--app-cool)",
  action: "var(--app-accent-press)",
  minor: "var(--app-warning)",
  moderate: "var(--app-brand-press)",
  major: "var(--app-brand-press)",
};

export default function FloodGauge({
  current,
  stages,
  category,
  animated = false,
}: {
  current: number;
  stages: FloodStages;
  category: FloodCategory;
  /** One-shot reveal on mount: the level bar wipes in left-to-right (water
   *  filling). Freezes under prefers-reduced-motion. */
  animated?: boolean;
}) {
  // Domain runs 0 → just past major so the "major" band stays visible.
  const domainMax = stages.major * 1.12;
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / domainMax)) * 100}%`;
  const zones: Array<{ key: string; from: number; to: number }> = [
    { key: "normal", from: 0, to: stages.action },
    { key: "action", from: stages.action, to: stages.minor },
    { key: "minor", from: stages.minor, to: stages.moderate },
    { key: "moderate", from: stages.moderate, to: stages.major },
    { key: "major", from: stages.major, to: domainMax },
  ];
  const markerLeft = pct(current);
  const ink = CATEGORY_INK[category.key];

  // Honest caption: distance to (or past) the flood stage, in plain words.
  const distance =
    category.toFloodFt > 0
      ? `${category.toFloodFt.toFixed(1)} ft below flood stage`
      : category.toFloodFt === 0
        ? "at flood stage"
        : `${Math.abs(category.toFloodFt).toFixed(1)} ft over flood stage`;

  return (
    <div className="space-y-1.5">
      <div
        role="img"
        aria-label={`Gage height ${current.toFixed(2)} ft, ${category.label}. NWS flood stage ${category.floodStageFt} ft. ${distance}.`}
        className={`relative h-2.5 w-full overflow-hidden rounded-full${animated ? " flood-fill" : ""}`}
        style={{ background: "var(--app-bg-sunken)" }}
      >
        {zones.map((z) => {
          const left = (z.from / domainMax) * 100;
          const width = ((z.to - z.from) / domainMax) * 100;
          if (width <= 0) return null;
          return (
            <span
              key={z.key}
              aria-hidden
              className="absolute inset-y-0"
              style={{ left: `${left}%`, width: `${width}%`, background: ZONE_FILL[z.key] }}
            />
          );
        })}
        {/* Current-level marker — a crisp ink tick that reads on any zone. */}
        <span
          aria-hidden
          className="absolute inset-y-[-2px] w-[2.5px] rounded-full"
          style={{
            left: markerLeft,
            transform: "translateX(-50%)",
            background: "var(--app-ink)",
            boxShadow: "0 0 0 1.5px var(--app-bg-elevated)",
          }}
        />
      </div>
      <p className="flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
        <span className="font-semibold uppercase tracking-[0.08em]" style={{ color: ink }}>
          {category.label}
        </span>
        <span style={{ color: "var(--app-ink-3)" }}>
          flood stage {category.floodStageFt} ft · {distance}
        </span>
      </p>
    </div>
  );
}
