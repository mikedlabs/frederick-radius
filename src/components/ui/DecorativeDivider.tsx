/**
 * DecorativeDivider — a small SVG ornament between sections.
 *
 * Four variants tuned to feel like a designed editorial product:
 *   - "wave"     — Catoctin / South Mountain contour profile
 *   - "dotted"   — three-dot rail, the publishing convention
 *   - "sun"      — half-disc + ray, warm civic emblem
 *   - "asterism" — three asterisks centered, like a magazine break
 *
 * Pure presentational. Pass `accent` for a per-section tint; default
 * picks up `--section-accent` so the ornament inherits the route's
 * identity color via RouteAccent.
 */
export default function DecorativeDivider({
  variant = "wave",
  accent,
  className = "",
}: {
  variant?: "wave" | "dotted" | "sun" | "asterism";
  accent?: string;
  className?: string;
}) {
  const color = accent ?? "var(--section-accent, var(--app-brand))";

  if (variant === "wave") {
    return (
      <div
        className={`flex justify-center py-2 ${className}`}
        aria-hidden
      >
        <svg viewBox="0 0 160 12" className="h-3 w-40" preserveAspectRatio="none">
          <path
            d="M 2 8 Q 20 -2, 40 6 T 80 8 T 120 4 T 158 8"
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            strokeLinecap="round"
            opacity={0.7}
          />
        </svg>
      </div>
    );
  }

  if (variant === "dotted") {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-2 ${className}`}
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1 w-1 rounded-full"
            style={{ background: color, opacity: 0.55 }}
          />
        ))}
      </div>
    );
  }

  if (variant === "sun") {
    return (
      <div
        className={`flex justify-center py-2 ${className}`}
        aria-hidden
      >
        <svg viewBox="0 0 80 18" className="h-4 w-24" preserveAspectRatio="xMidYMid meet">
          <path
            d="M 8 14 L 72 14"
            stroke={color}
            strokeWidth={1}
            opacity={0.4}
            strokeLinecap="round"
          />
          <path
            d="M 28 14 A 12 12 0 0 1 52 14"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx={40} cy={14} r={2} fill={color} />
        </svg>
      </div>
    );
  }

  // asterism
  return (
    <div
      className={`flex items-center justify-center gap-3 py-2 font-serif text-[14px] ${className}`}
      style={{ color, opacity: 0.55 }}
      aria-hidden
    >
      <span>*</span>
      <span>*</span>
      <span>*</span>
    </div>
  );
}
