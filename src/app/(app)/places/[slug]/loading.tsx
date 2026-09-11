import Skeleton from "@/components/ui/Skeleton";

/** Instant route-transition skeleton for a place detail page — hero
 *  photo, title block, and a few content rows. */
export default function PlaceLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only" role="status">Loading place</span>
      <Skeleton.Block height={220} round="var(--app-radius-lg)" />
      <div className="space-y-2">
        <Skeleton.Block width={70} height={11} />
        <Skeleton.Block width="70%" height={26} round="var(--app-radius-sm)" />
        <Skeleton.Block width="50%" height={14} />
      </div>
      <div className="flex gap-2">
        <Skeleton.Block width={96} height={40} round="var(--app-radius-md)" />
        <Skeleton.Block width={96} height={40} round="var(--app-radius-md)" />
        <Skeleton.Block width={96} height={40} round="var(--app-radius-md)" />
      </div>
      <Skeleton.Block height={120} round="var(--app-radius-lg)" />
      <Skeleton.Block height={180} round="var(--app-radius-lg)" />
    </div>
  );
}
