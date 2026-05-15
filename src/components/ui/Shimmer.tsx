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

export function ShimmerWeatherStrip() {
  return (
    <div className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3"
         style={{ borderColor: "var(--app-border)" }}>
      <div className="mb-2 flex justify-between">
        <Shimmer className="h-3 w-32" />
        <Shimmer className="h-3 w-20" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
            <Shimmer className="h-3 w-8" />
            <Shimmer className="h-6 w-6 rounded-full" />
            <Shimmer className="h-3 w-7" />
          </div>
        ))}
      </div>
    </div>
  );
}
