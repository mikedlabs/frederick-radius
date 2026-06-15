import type { OpenStatus } from "@/lib/hours";
import { formatHoursLine } from "@/lib/hours";

export default function OpenClosedDot({ status, withLabel = true }: { status: OpenStatus; withLabel?: boolean }) {
  const color =
    status.state === "open" ? "var(--app-positive)" :
    status.state === "closing-soon" ? "var(--app-warning)" :
    status.state === "closed" ? "var(--app-ink-3)" :
    status.state === "unverified" ? "var(--app-cool)" :
    "var(--app-ink-3)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color }}
      {...(!withLabel ? { role: "img", "aria-label": formatHoursLine(status) } : {})}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {withLabel && <span>{formatHoursLine(status)}</span>}
    </span>
  );
}
