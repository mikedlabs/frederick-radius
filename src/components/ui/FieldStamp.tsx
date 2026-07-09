import type { CSSProperties } from "react";

/**
 * FieldStamp — a rubber-stamp / certification SEAL, the field-guide
 * "official mark." Two arcs of mono caps around a concentric radius
 * crosshair (the brand's locator), with a ticked ring and a slight
 * hand-stamped tilt + inked opacity. This is the trust mark for the
 * VERIFIED Field Notes layer (the moat) and any "certified by Frederick
 * Radius" moment.
 *
 * Decorative + supplementary: always aria-hidden. The meaning ("verified")
 * must also be conveyed in adjacent real text, never by the seal alone.
 * Server-safe (no hooks); pass a unique `id` when several render on a page
 * so the two textPath arcs resolve to the right paths.
 */
export default function FieldStamp({
  top = "FREDERICK RADIUS",
  bottom = "VERIFIED",
  id = "fs",
  size = 76,
  tone = "var(--app-brand)",
  rotate = -4,
  className = "",
  style,
}: {
  top?: string;
  bottom?: string;
  id?: string;
  size?: number;
  tone?: string;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const topId = `${id}-t`;
  const botId = `${id}-b`;
  // Fit the top arc to its text. At 8px mono (0.6em advance) + 1.2px tracking,
  // a long string like "VERIFIED AT SOURCE" (~107 units) overflows the r=32
  // semicircle (~100 units) and clips to "ERIFIED AT SOURC". Long strings get
  // a wider arc (still inside the r=41.5 ring; cap height ~5.8) and tighter
  // tracking so the whole mark always renders.
  const longTop = top.length > 14;
  const topR = longTop ? 34.5 : 32;
  const topSpacing = longTop ? "0.8px" : "1.2px";
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`pointer-events-none shrink-0 ${className}`}
      style={{ color: tone, opacity: 0.9, transform: `rotate(${rotate}deg)`, ...style }}
      fill="none"
      stroke="currentColor"
    >
      <defs>
        <path id={topId} d={`M ${50 - topR} 50 A ${topR} ${topR} 0 0 1 ${50 + topR} 50`} />
        <path id={botId} d="M 18 51 A 32 32 0 0 0 82 51" />
      </defs>
      <circle cx="50" cy="50" r="47" strokeWidth="2" />
      <circle cx="50" cy="50" r="41.5" strokeWidth="0.8" />
      <circle cx="50" cy="50" r="44.25" strokeWidth="1.4" strokeDasharray="0.6 5.2" opacity="0.7" />
      {/* concentric radius crosshair — the brand locator */}
      <circle cx="50" cy="50" r="6.5" strokeWidth="1" />
      <circle cx="50" cy="50" r="11.5" strokeWidth="1" />
      <path d="M50 34.5V65.5M34.5 50H65.5" strokeWidth="0.7" opacity="0.6" />
      <circle cx="50" cy="50" r="1.6" fill="currentColor" stroke="none" />
      <text
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "8px", fontWeight: 600, letterSpacing: topSpacing }}
      >
        <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      <text
        fill="currentColor"
        stroke="none"
        style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "8px", fontWeight: 600, letterSpacing: "1.6px" }}
      >
        <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
          {bottom}
        </textPath>
      </text>
    </svg>
  );
}
