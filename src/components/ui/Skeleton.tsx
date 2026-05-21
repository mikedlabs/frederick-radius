import type { CSSProperties } from "react";

/**
 * Skeleton — shimmer-y placeholder primitives for loading states.
 *
 * Three variants cover most surfaces:
 *   <Skeleton.Block />  — rectangular block (set width/height/round)
 *   <Skeleton.Row />    — PlaceCard / event-row shape (thumb + 2 lines)
 *   <Skeleton.Card />   — full-card-shaped block with optional header,
 *                         photo, and a few text rows
 *
 * Each uses the global `.shimmer` class from globals.css (sweep
 * animation, ~1.6s). All are aria-hidden — they exist for visual
 * continuity, not for assistive tech (announce "Loading…" via
 * aria-busy on the consuming wrapper if needed).
 */

function Block({
  className = "",
  width,
  height = 16,
  round = "var(--app-radius-sm)",
  style,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  round?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius: round,
        ...style,
      }}
    />
  );
}

function Row({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`flex items-center gap-3 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid,var(--app-bg-elevated))] p-3.5 ${className}`}
      style={{ borderColor: "var(--app-border)" }}
    >
      <Block width={64} height={64} round="var(--app-radius-md)" />
      <div className="min-w-0 flex-1 space-y-2">
        <Block height={14} width="65%" />
        <Block height={12} width="40%" />
        <div className="flex gap-3 pt-1">
          <Block height={10} width={70} />
          <Block height={10} width={50} />
        </div>
      </div>
    </div>
  );
}

function Card({
  withPhoto = true,
  className = "",
}: {
  withPhoto?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid,var(--app-bg-elevated))] ${className}`}
      style={{ borderColor: "var(--app-border)" }}
    >
      {withPhoto && <Block height={160} round={0} />}
      <div className="space-y-2 p-4">
        <Block height={11} width={70} />
        <Block height={18} width="75%" />
        <Block height={12} width="55%" />
        <div className="flex gap-3 pt-1">
          <Block height={10} width={50} />
          <Block height={10} width={40} />
        </div>
      </div>
    </div>
  );
}

const Skeleton = { Block, Row, Card };
export default Skeleton;
