import Link from "next/link";
import StateDot, { type OpenState } from "./StateDot";

/**
 * ResultRow — the default result presentation (redesign brief: "results
 * render as rows, not cards"). 64px tall, NO image (that's where the
 * density and load speed come from). Carries: name · category · open-state
 * dot · walk-time · one-line hook. Pure, server-safe, link-or-static.
 *
 * Density target: ≥9 of these are scannable on a 390×844 viewport.
 */

export type ResultRowData = {
  name: string;
  category: string;
  state: OpenState;
  /** Walk time from the map/list center, e.g. "6 min". Omit if unknown. */
  walk?: string;
  /** One short editorial/why line. Optional. */
  hook?: string;
  href?: string;
};

export default function ResultRow({
  name,
  category,
  state,
  walk,
  hook,
  href,
  active = false,
}: ResultRowData & { active?: boolean }) {
  const inner = (
    <div
      className="flex h-16 w-full items-center gap-3 px-3"
      style={{
        background: active ? "var(--app-brand-tint-6)" : "transparent",
        boxShadow: active
          ? "inset 2px 0 0 var(--app-cool)"
          : "inset 0 -1px 0 var(--app-border)",
      }}
    >
      <StateDot state={state} size={9} className="mt-[1px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="t-lead t-semibold truncate"
            style={{ color: "var(--app-ink)" }}
          >
            {name}
          </span>
          <span className="t-meta shrink-0" style={{ color: "var(--app-ink-3)" }}>
            {category}
          </span>
        </div>
        {hook && (
          <div className="t-body truncate" style={{ color: "var(--app-ink-2)" }}>
            {hook}
          </div>
        )}
      </div>
      {walk && (
        <span
          className="t-meta shrink-0 font-mono tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {walk}
        </span>
      )}
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]">
      {inner}
    </Link>
  );
}
