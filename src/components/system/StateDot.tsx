/**
 * StateDot — the open-state semantic indicator (redesign identity pillar 2).
 *
 * Maps a place's open status to the ONE meaning system the app uses
 * everywhere (rows, pins, detail): open = green, closing-soon = amber,
 * closed = muted neutral (NOT red — closed is a state, not an error),
 * unverified/unknown = faint. Reads from the --state-* tokens only.
 */

export type OpenState =
  | "open"
  | "closing-soon"
  | "closed"
  | "unverified"
  | "unknown";

const TONE: Record<OpenState, { fg: string; label: string }> = {
  open: { fg: "var(--state-open)", label: "Open" },
  "closing-soon": { fg: "var(--state-closing)", label: "Closing soon" },
  closed: { fg: "var(--state-closed)", label: "Closed" },
  unverified: { fg: "var(--state-unknown)", label: "Hours unverified" },
  unknown: { fg: "var(--state-unknown)", label: "Hours unknown" },
};

export default function StateDot({
  state,
  size = 8,
  className = "",
}: {
  state: OpenState;
  size?: number;
  className?: string;
}) {
  const tone = TONE[state];
  return (
    <span
      role="img"
      aria-label={tone.label}
      title={tone.label}
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: tone.fg,
        // A soft ring only on the live "open" state so it reads as active
        // without animation (calm instrument, not a notification).
        boxShadow:
          state === "open"
            ? `0 0 0 3px var(--state-open-bg)`
            : state === "closing-soon"
              ? `0 0 0 3px var(--state-closing-bg)`
              : undefined,
      }}
    />
  );
}

export const STATE_LABEL = (s: OpenState) => TONE[s].label;
