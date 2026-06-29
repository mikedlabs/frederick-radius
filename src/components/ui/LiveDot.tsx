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
    // With a visible label the text carries the meaning; WITHOUT one the dot is
    // a color/motion-only signal, so name the wrapper for assistive tech and
    // keep the dot decorative. Never rely on color alone.
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color }}
      {...(label ? {} : { role: "img", "aria-label": "Live now" })}
    >
      <span className="live-dot" aria-hidden />
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      )}
    </span>
  );
}
