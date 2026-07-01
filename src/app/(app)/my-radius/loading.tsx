import Skeleton from "@/components/ui/Skeleton";

/** Instant route-transition skeleton for /my-radius (saved). Header +
 *  saved-row placeholders so the tab swap never freezes on tap. */
export default function MyRadiusLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only" role="status">Loading your saved list</span>
      <div className="space-y-2">
        <Skeleton.Block width={140} height={26} round="var(--app-radius-sm)" />
        <Skeleton.Block width={220} height={14} />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton.Row key={i} />
        ))}
      </div>
    </div>
  );
}
