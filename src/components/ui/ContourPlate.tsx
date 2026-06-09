/**
 * The specimen-plate mark — concentric contour rings + crosshair, the
 * field-guide motif from the Saved page header. Extracted so the brand's
 * most distinctive element appears consistently on system surfaces
 * (not-found, route errors) instead of living on one page. Decorative
 * only; always aria-hidden.
 */
export default function ContourPlate({
  className = "",
  size = 120,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`pointer-events-none ${className}`}
      style={{ color: "var(--app-ink)", opacity: 0.1 }}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="60" cy="60" r="13" strokeWidth="1.25" />
      <circle cx="60" cy="60" r="25" strokeWidth="1.25" />
      <circle cx="60" cy="60" r="37" strokeWidth="1.25" />
      <circle cx="60" cy="60" r="49" strokeWidth="1.25" />
      <path d="M60 2 v116 M2 60 h116" strokeWidth="0.6" />
    </svg>
  );
}
