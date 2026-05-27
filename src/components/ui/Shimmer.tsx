/**
 * Skeleton with shimmer sweep. Used in Suspense fallbacks.
 */
export default function Shimmer({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`shimmer rounded-[var(--app-radius-md)] ${className}`}
      style={style}
      aria-hidden
    />
  );
}

export function ShimmerCard({ rows = 2 }: { rows?: number }) {
  return (
    <div
      className="space-y-2 rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <Shimmer className="h-4 w-3/4" />
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} className={`h-3 ${i === rows - 1 ? "w-1/2" : "w-full"}`} />
      ))}
    </div>
  );
}

