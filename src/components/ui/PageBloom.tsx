import type { CSSProperties } from "react";

/**
 * PageBloom — the shader-style cinematic background that sits behind
 * every page. Four colored "orbs" slowly drift on independent cycles
 * (42s / 55s / 67s / 81s) with `mix-blend-mode: screen` so where they
 * overlap they GLOW rather than stack opaquely. A subtle SVG grain
 * texture rides on top so the surface feels organic, not flat CSS.
 *
 * Pure presentation — pointer-events-none, aria-hidden, never
 * interferes with interaction. GPU-composited transforms only, so
 * the four animations cost essentially nothing on modern phones.
 * Respects prefers-reduced-motion (orbs hold static).
 *
 * Per-page tint comes from the section-accent CSS variable set by
 * RouteAccent on the layout, so each route (Today warm, Radius cool,
 * Plan green, Events warm) is auto theme-consistent.
 *
 * The `variant` prop adjusts the *composition* of orbs, not the count:
 *   • warm-cool  — the daily-landing default (brand + cool + accent + brand-2)
 *   • cool       — civic / data routes (cool-leaning palette)
 *   • single     — quieter pages (one accent + one warm)
 */
export default function PageBloom({
  variant = "warm-cool",
  className = "",
  style,
}: {
  variant?: "warm-cool" | "cool" | "single";
  className?: string;
  style?: CSSProperties;
}) {
  type Orb = { color: string; x: string; y: string; size: string; opacity: number };

  // Sizes go up to ~90% of the viewport so orbs overlap on most
  // screens (the overlap is where the screen-blend makes them glow).
  // Opacities are tuned cinematically: bright enough that whitespace
  // between cards reads as warm aurora, not flat paper, but not so
  // hot that the eye fights the foreground content.
  const ORBS_WARM_COOL: Orb[] = [
    { color: "var(--app-brand)",   x: "-15%", y: "-20%", size: "85%", opacity: 0.55 },
    { color: "var(--app-cool)",    x: "45%",  y: "-15%", size: "78%", opacity: 0.48 },
    { color: "var(--app-accent)",  x: "20%",  y: "50%",  size: "90%", opacity: 0.40 },
    { color: "var(--app-brand-2)", x: "55%",  y: "40%",  size: "70%", opacity: 0.45 },
  ];
  const ORBS_COOL: Orb[] = [
    { color: "var(--app-cool)",    x: "-15%", y: "-20%", size: "85%", opacity: 0.55 },
    { color: "var(--app-cool-2)",  x: "45%",  y: "-10%", size: "78%", opacity: 0.45 },
    { color: "var(--app-brand-2)", x: "55%",  y: "50%",  size: "75%", opacity: 0.40 },
    { color: "var(--app-accent)",  x: "-10%", y: "45%",  size: "60%", opacity: 0.30 },
  ];
  const ORBS_SINGLE: Orb[] = [
    { color: "var(--section-accent, var(--app-brand))", x: "5%", y: "-15%", size: "95%", opacity: 0.45 },
    { color: "var(--app-accent)", x: "50%", y: "45%", size: "70%", opacity: 0.32 },
  ];

  const orbs =
    variant === "cool" ? ORBS_COOL :
    variant === "single" ? ORBS_SINGLE :
    ORBS_WARM_COOL;

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      style={style}
    >
      {orbs.map((orb, i) => (
        <div
          key={i}
          className={`aurora-orb aurora-orb-${(i % 4) + 1}`}
          style={{
            left: orb.x,
            top: orb.y,
            width: orb.size,
            aspectRatio: "1 / 1",
            background: `radial-gradient(circle at center, ${orb.color} 0%, transparent 70%)`,
            opacity: orb.opacity,
          }}
        />
      ))}
      <div className="aurora-grain" />
    </div>
  );
}
