import type { LngLat } from "@/lib/geo";

/**
 * TownLocatorLine — a compact field-guide "locator" strip that echoes the
 * Saved page's plate mark: a small concentric-contour SVG (a faint
 * topographic locator) paired with a coordinate line in mono caps.
 *
 * It gives the town page a quiet sense of *place on a map* without a heavy
 * stat block. When a centroid is available we print real DMS-ish decimal
 * coordinates; otherwise we fall back to the municipal {type}. Pure
 * presentation — no data loading, reduced-motion-safe (no animation).
 */
export default function TownLocatorLine({
  centroid,
  type,
}: {
  centroid?: LngLat | null;
  type: string;
}) {
  const coords = centroid
    ? `${Math.abs(centroid.lat).toFixed(4)}° ${centroid.lat >= 0 ? "N" : "S"}  ·  ${Math.abs(centroid.lng).toFixed(4)}° ${centroid.lng >= 0 ? "E" : "W"}`
    : null;

  return (
    <div
      className="flex items-center gap-2.5 px-0.5"
      style={{ color: "var(--app-ink-3)" }}
    >
      <PlateMark />
      <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums">
        {coords ?? type}
      </span>
    </div>
  );
}

/** A faint concentric-contour locator — the "plate" mark. */
function PlateMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className="shrink-0"
      style={{ color: "var(--app-ink-3)", opacity: 0.7 }}
    >
      <circle cx="11" cy="11" r="9.25" stroke="currentColor" strokeWidth="0.75" opacity="0.45" />
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="0.75" opacity="0.65" />
      <circle cx="11" cy="11" r="2.75" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="11" cy="11" r="0.9" fill="currentColor" />
      <path d="M11 0.5V3.25M11 18.75V21.5M0.5 11H3.25M18.75 11H21.5" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
    </svg>
  );
}
