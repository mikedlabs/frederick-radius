import type { CSSProperties } from "react";

/**
 * PageBloom — the warm atmospheric wash behind every page.
 *
 * History: this used to be four blurred "aurora" orbs drifting on 42–81s
 * loops. Two problems retired that: (1) animating four large blurred layers
 * measurably cut scroll FPS (the perf audit's finding), and (2) an
 * aurora/blob/mesh background is a well-worn "this was AI-generated" tell
 * (see docs/DESIGN_TELLS.md). Reduced-motion users already saw a static
 * version, and it read fine — so this now gives everyone a single STATIC
 * gradient wash: same "whitespace reads warm, not flat paper" intent, none
 * of the animation cost, and none of the blob look. A faint SVG grain still
 * rides on top so the surface feels like paper, not flat CSS.
 *
 * Pure presentation — pointer-events-none, aria-hidden, one fixed layer.
 * Per-page tint still flows from the section-accent variable RouteAccent
 * sets, so each route stays theme-consistent.
 *
 * The `variant` prop shifts the wash composition:
 *   • warm-cool  — the daily-landing default (brand + cool + almanac gold)
 *   • warm       — quiet editorial pages (brand + gold + warm ink)
 *   • cool       — civic / data routes (cool-leaning)
 *   • single     — quieter pages (section accent + a warm lift)
 */
export default function PageBloom({
  variant = "warm-cool",
  className = "",
  style,
}: {
  variant?: "warm-cool" | "warm" | "cool" | "single";
  className?: string;
  style?: CSSProperties;
}) {
  // Each wash is a few large, low-strength radial tints layered on one
  // element — no animation, no blur filter, no per-frame compositing. Mix
  // strengths are deliberately gentle (7–10%) so the gaps between cards read
  // as a faint warm field, never a gradient the eye fights.
  const WASHES: Record<typeof variant, string> = {
    "warm-cool":
      "radial-gradient(120% 90% at 15% -5%, color-mix(in srgb, var(--app-brand) 10%, transparent), transparent 60%)," +
      "radial-gradient(120% 90% at 92% 8%, color-mix(in srgb, var(--app-cool) 9%, transparent), transparent 58%)," +
      "radial-gradient(140% 100% at 55% 108%, color-mix(in srgb, var(--app-accent) 8%, transparent), transparent 62%)",
    warm:
      "radial-gradient(120% 90% at 10% -8%, color-mix(in srgb, var(--app-brand) 7%, transparent), transparent 61%)," +
      "radial-gradient(130% 95% at 96% 12%, color-mix(in srgb, var(--app-accent) 6%, transparent), transparent 63%)," +
      "radial-gradient(140% 100% at 54% 110%, color-mix(in srgb, var(--app-ink) 3%, transparent), transparent 65%)",
    cool:
      "radial-gradient(120% 90% at 12% -5%, color-mix(in srgb, var(--app-cool) 11%, transparent), transparent 60%)," +
      "radial-gradient(120% 90% at 90% 10%, color-mix(in srgb, var(--app-cool-2) 9%, transparent), transparent 58%)," +
      "radial-gradient(140% 100% at 60% 108%, color-mix(in srgb, var(--app-brand-2) 8%, transparent), transparent 62%)",
    single:
      "radial-gradient(130% 95% at 12% -8%, color-mix(in srgb, var(--section-accent, var(--app-brand)) 10%, transparent), transparent 62%)," +
      "radial-gradient(120% 90% at 88% 100%, color-mix(in srgb, var(--app-accent) 7%, transparent), transparent 60%)",
  };

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      style={style}
    >
      <div className="absolute inset-0" style={{ background: WASHES[variant] }} />
      <div className="aurora-grain" />
    </div>
  );
}
