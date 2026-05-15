/**
 * Standardized "happening now" indicator — small dot with an outward pulse ring.
 * Pure CSS, no JS, respects prefers-reduced-motion via globals.css.
 */
export default function LiveDot({
  label,
  color = "var(--app-brand)",
}: {
  label?: string;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color }}>
      <span className="live-dot" aria-hidden />
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      )}
    </span>
  );
}
