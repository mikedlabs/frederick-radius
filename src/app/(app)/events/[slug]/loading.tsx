import Skeleton from "@/components/ui/Skeleton";

/** Instant route-transition skeleton for an event detail page — hero,
 *  title, when/where lines, and a content block. */
export default function EventLoading() {
  return (
    <div className="space-y-5">
      <Skeleton.Block height={220} round="var(--app-radius-lg)" />
      <div className="space-y-2">
        <Skeleton.Block width={90} height={11} />
        <Skeleton.Block width="75%" height={26} round="var(--app-radius-sm)" />
        <Skeleton.Block width={180} height={14} />
        <Skeleton.Block width={140} height={14} />
      </div>
      <Skeleton.Block height={150} round="var(--app-radius-lg)" />
    </div>
  );
}
