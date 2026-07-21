/**
 * The Ripple — the Frederick Radius mark. Concentric half-arcs rising from a
 * single point: something happening, radiating out from a place.
 *
 * Geometry is verbatim from the brand handoff (Claude Design project
 * "Frederick Radius: Why It Exists", 2026-07-21), including its small-size
 * simplification rule: three arcs at 96px and up, inner + middle arcs from
 * 64px, and the single-arc + dot favicon form below that. The handoff's brand
 * rule applies everywhere this renders: the mark is always the ripple, never
 * letters.
 *
 * `tile` renders the mark on its brick squircle (the app-icon look — brick
 * #B5462B, paper #F4EEE2, matching public/icons/icon.svg). Without `tile` the
 * mark draws in currentColor so it recolors to context, same contract as
 * public/icons/mark.svg.
 */
export default function RippleMark({
  size = 28,
  tile = false,
  className,
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  const stroke = tile ? "#F4EEE2" : "currentColor";
  const squircle =
    "M0 23.33 C0 7.5 7.5 0 23.33 0 H76.67 C92.5 0 100 7.5 100 23.33 V76.67 C100 92.5 92.5 100 76.67 100 H23.33 C7.5 100 0 92.5 0 76.67 Z";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {tile && <path d={squircle} fill="#B5462B" />}
      {size >= 96 ? (
        <>
          <g fill="none" stroke={stroke} strokeLinecap="round" strokeWidth={4}>
            <path d="M31 78 A 19 19 0 0 1 69 78" strokeOpacity={0.95} />
            <path d="M15 78 A 35 35 0 0 1 85 78" strokeOpacity={0.55} />
            <path d="M-1 78 A 51 51 0 0 1 101 78" strokeOpacity={0.28} />
          </g>
          <circle cx="50" cy="78" r="8" fill={stroke} />
        </>
      ) : size >= 64 ? (
        <>
          <g fill="none" stroke={stroke} strokeLinecap="round" strokeWidth={5}>
            <path d="M31 78 A 19 19 0 0 1 69 78" strokeOpacity={0.95} />
            <path d="M15 78 A 35 35 0 0 1 85 78" strokeOpacity={0.55} />
          </g>
          <circle cx="50" cy="78" r="8" fill={stroke} />
        </>
      ) : (
        <>
          <path
            d="M27 74 A 23 23 0 0 1 73 74"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth={7}
            strokeOpacity={0.95}
          />
          <circle cx="50" cy="74" r="11" fill={stroke} />
        </>
      )}
    </svg>
  );
}
