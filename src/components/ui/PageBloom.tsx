import type { CSSProperties } from "react";
import RippleMark from "@/components/brand/RippleMark";

/**
 * PageBloom is the static field-guide paper under a page: a soft top light
 * and the paper grain. Nothing in it moves.
 *
 * It used to float two blurred color blobs on a loop behind roughly fifty
 * pages. docs/DESIGN_TELLS.md rules that out ("Decorative glows are not part
 * of the public product"), so the blobs and their motion are gone. The
 * optional motif is a registration mark for a hero or editorial feature, not
 * a watermark behind every ordinary tool page, and it holds still too.
 */
export default function PageBloom({
  variant = "warm-cool",
  motif = false,
  className = "",
  style,
}: {
  /** Tints the optional motif. The paper itself is the same on every page. */
  variant?: "warm-cool" | "warm" | "cool" | "single";
  /** Opt in only when the page genuinely needs an editorial brand moment (RippleMark watermark). */
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
      data-page-bloom
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      style={style}
    >
      <div
        data-page-paper
        className="absolute inset-x-0 top-0 h-56"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--app-bg-elevated-solid) 42%, transparent), transparent)",
        }}
      />

      {motif && (
        <div
          data-page-motif
          className="absolute -right-24 -top-32"
          style={{ color: tone, opacity: 0.055 }}
        >
          <RippleMark size={330} detail="full" />
        </div>
      )}

      {/* Global paper grain effect */}
      <div className="aurora-grain" />
    </div>
  );
}
