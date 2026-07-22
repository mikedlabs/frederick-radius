import type { CSSProperties } from "react";
import RippleMark from "@/components/brand/RippleMark";

/**
 * PageBloom keeps the field-guide paper treatment available for rare moments,
 * but it is deliberately quiet by default. An oversized Ripple is a
 * registration mark for a hero, onboarding, or editorial feature, not a
 * watermark behind every ordinary tool page.
 *
 * Route variants only choose the ink used for that mark. They do not create a
 * different decorative background for every page; the content remains the
 * route's identity.
 */
export default function PageBloom({
  variant = "warm-cool",
  motif = false,
  className = "",
  style,
}: {
  variant?: "warm-cool" | "warm" | "cool" | "single";
  /** Opt in only when the page genuinely needs an editorial brand moment. */
  motif?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const tone =
    variant === "cool"
      ? "var(--app-cool)"
      : variant === "single"
        ? "var(--section-accent, var(--app-brand))"
        : variant === "warm"
          ? "var(--app-brand)"
          : "var(--app-ink-2)";

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      style={style}
    >
      <div
        className="absolute inset-x-0 top-0 h-56"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--app-bg-elevated-solid) 42%, transparent), transparent)",
        }}
      />
      {motif && (
        <>
          <div
            className="absolute -right-24 -top-32 opacity-[0.055]"
            style={{ color: tone }}
          >
            <RippleMark size={330} detail="full" />
          </div>
          <div className="aurora-grain" />
        </>
      )}
    </div>
  );
}
