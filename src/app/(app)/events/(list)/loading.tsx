import Skeleton from "@/components/ui/Skeleton";

/** Instant route-transition skeleton for /events — header + a column of
 *  event-row placeholders so the tab swap never freezes on tap. */
export default function EventsLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only" role="status">Loading events</span>
      <div className="space-y-2">
        <Skeleton.Block width={160} height={26} round="var(--app-radius-sm)" />
        <Skeleton.Block width={240} height={14} />
      </div>
      {/* Time-filter chips */}
      <div className="flex gap-2">
        <Skeleton.Block width={72} height={32} round="9999px" />
        <Skeleton.Block width={72} height={32} round="9999px" />
        <Skeleton.Block width={88} height={32} round="9999px" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton.Row key={i} />
        ))}
      </div>
    </div>
  );
}
