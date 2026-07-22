/**
 * The Ripple — the Frederick Radius mark. Concentric half-arcs rising from a
 * single point: something happening, radiating out from a place.
 *
 * Geometry is verbatim from the Warm Civic brand handoff, including its
 * optical-size rule: three arcs at 48px and up, two arcs from 24px, and the
 * single-arc + dot form only below 24px (favicon scale). The handoff's brand
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
  detail = "auto",
}: {
  size?: number;
  tile?: boolean;
  className?: string;
  /** Override the optical-size selection for exported or display artwork. */
  detail?: "auto" | RippleDetail;
}) {
  const stroke = tile ? BRAND.colors.cream : "currentColor";
  const resolvedDetail = detail === "auto" ? rippleDetailForSize(size) : detail;
  const geometry = RIPPLE_GEOMETRY[resolvedDetail];
  const markTransform = tile
    ? `translate(14 14) scale(.72) translate(0 ${geometry.opticalOffsetY})`
    : `translate(0 ${geometry.opticalOffsetY})`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      {tile && <path d={RIPPLE_GEOMETRY.squircle} fill={BRAND.colors.brick} />}
      <g transform={markTransform}>
        <g
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeWidth={geometry.strokeWidth}
        >
          {geometry.paths.map((path, index) => (
            <path
              key={path}
              d={path}
              strokeOpacity={geometry.opacities[index]}
            />
          ))}
        </g>
        <circle
          cx="50"
          cy={geometry.baseline}
          r={geometry.dotRadius}
          fill={stroke}
        />
      </g>
    </svg>
  );
}
import {
  BRAND,
  RIPPLE_GEOMETRY,
  rippleDetailForSize,
  type RippleDetail,
} from "@/lib/brand";
