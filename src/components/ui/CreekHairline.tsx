/**
 * CreekHairline — a stylized Carroll Creek-shaped section divider.
 *
 * Replaces the generic "thin hr" pattern between major editorial
 * sections with a tiny wavy SVG that traces the slow undulation
 * of the creek through downtown Frederick. Subtle on a quick scan,
 * recognized by a local on a second look.
 *
 * Decorative only: aria-hidden, scales horizontally via
 * preserveAspectRatio. ~120 bytes of inline SVG, no animation.
 */
export default function CreekHairline({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`my-1 px-6 opacity-60 ${className}`}
    >
      <svg
        viewBox="0 0 240 6"
        preserveAspectRatio="none"
        className="block h-1.5 w-full"
      >
        <path
          d="M0,3 C20,0.5 40,5.5 60,3 C80,0.5 100,5.5 120,3 C140,0.5 160,5.5 180,3 C200,0.5 220,5.5 240,3"
          fill="none"
          stroke="var(--app-cool)"
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
