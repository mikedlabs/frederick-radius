import type { CSSProperties } from "react";

/**
 * Page-level decorative gradient blooms. Fixed behind the content so
 * every screen of a page sits on a softly tinted backdrop instead of
 * flat --app-bg. Pointer-events-none and aria-hidden so it never
 * interferes with interaction or assistive tech.
 *
 * Per-route tint comes from the section-accent variable set by
 * RouteAccent, so each page (Today warm, Radius cool, Plan green,
 * Events warm) is automatically theme-consistent.
 */
export default function PageBloom({
  variant = "warm-cool",
  className = "",
  style,
}: {
  /** Composition preset. "warm-cool" is the daily-landing default;
   *  "cool" is for civic / data pages; "single" is one bloom only. */
  variant?: "warm-cool" | "cool" | "single";
  className?: string;
  style?: CSSProperties;
}) {
  const bg =
    variant === "warm-cool"
      ? "radial-gradient(60% 40% at 8% 18%, color-mix(in srgb, var(--app-brand) 10%, transparent), transparent 70%), radial-gradient(45% 35% at 95% 38%, color-mix(in srgb, var(--app-cool) 9%, transparent), transparent 70%), radial-gradient(50% 35% at 50% 92%, color-mix(in srgb, var(--app-brand-2) 8%, transparent), transparent 70%)"
      : variant === "cool"
      ? "radial-gradient(55% 35% at 12% 14%, color-mix(in srgb, var(--app-cool) 12%, transparent), transparent 70%), radial-gradient(50% 35% at 92% 70%, color-mix(in srgb, var(--app-brand-2) 8%, transparent), transparent 70%)"
      : "radial-gradient(60% 40% at 50% 0%, color-mix(in srgb, var(--section-accent, var(--app-brand)) 10%, transparent), transparent 70%)";
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 ${className}`}
      style={{ background: bg, ...style }}
    />
  );
}
