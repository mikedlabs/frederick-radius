import { TRUST_COLOR, type TrustSignal } from "@/lib/trust";

/**
 * One trust primitive, rendered the same everywhere. A colored dot
 * carries the level, the label names it, the basis is the tooltip and
 * (in detail mode) a visible line. Presentational and dependency-free,
 * so it works in server and client components alike.
 */
export default function TrustChip({
  signal,
  detail = false,
  className = "",
}: {
  signal: TrustSignal;
  /** Detail surfaces also show the basis and freshness as text. */
  detail?: boolean;
  className?: string;
}) {
  const color = TRUST_COLOR[signal.level];
  const aria = `Source ${signal.label}. ${signal.basis}${
    signal.checked ? `. ${signal.checked}` : ""
  }`;

  const pill = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: "var(--app-bg-elevated)",
        border: "1px solid var(--app-border)",
        color: "var(--app-ink-2)",
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      {signal.label}
    </span>
  );

  if (!detail) {
    return (
      <span className={className} title={signal.basis} aria-label={aria}>
        {pill}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`} aria-label={aria}>
      {pill}
      <span className="text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        {signal.basis}
        {signal.checked ? ` · ${signal.checked}` : ""}
      </span>
    </span>
  );
}
