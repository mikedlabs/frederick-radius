import type { OpenState } from "./StateDot";

/**
 * Pin — the map marker, COLORED BY OPEN STATE (redesign brief: "pins are
 * colored by open state, never by a category rainbow"). This is the
 * standalone/reviewable primitive; wiring it into the live Mapbox canvas
 * (replacing the category-color pucks) is Phase 3. A teardrop in the
 * --state-* color with a white core; the live "open" pin gets a soft ring.
 */
const FILL: Record<OpenState, string> = {
  open: "var(--state-open)",
  "closing-soon": "var(--state-closing)",
  closed: "var(--state-closed)",
  unverified: "var(--state-unknown)",
  unknown: "var(--state-unknown)",
};

export default function Pin({
  state,
  size = 30,
  selected = false,
}: {
  state: OpenState;
  size?: number;
  selected?: boolean;
}) {
  const fill = FILL[state];
  return (
    <span
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size * 1.32 }}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: size * 1.5,
            height: size * 1.5,
            top: -size * 0.18,
            background: `color-mix(in srgb, ${fill} 22%, transparent)`,
          }}
        />
      )}
      <svg
        width={size}
        height={size * 1.32}
        viewBox="0 0 24 32"
        fill="none"
        aria-hidden
        className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]"
      >
        <path
          d="M12 0C5.4 0 0 5.3 0 11.9 0 20.2 12 32 12 32s12-11.8 12-20.1C24 5.3 18.6 0 12 0Z"
          fill={fill}
        />
        <circle cx="12" cy="11.6" r="4.4" fill="#fff" />
      </svg>
    </span>
  );
}
