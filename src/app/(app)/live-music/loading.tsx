import Skeleton from "@/components/ui/Skeleton";

/**
 * Instant route-transition skeleton for /live-music.
 *
 * The page is force-dynamic ("who's on stage right now" is live), so it has no
 * ISR cache to paint from; without this, the tap from Today's "Live music
 * tonight" band waited on the unified-event assembly behind a blank screen.
 * Shaped to the tonight list: breadcrumb, a dateline + serif title, then a few
 * show rows.
 */
export default function LiveMusicLoading() {
  return (
    <div className="mx-auto max-w-md space-y-5 py-6">
      {/* Breadcrumb */}
      <Skeleton.Block width={120} height={14} />
      {/* Dateline + title */}
      <div className="space-y-2">
        <Skeleton.Block width={130} height={12} />
        <Skeleton.Block width={220} height={28} />
      </div>
      {/* Tonight's shows */}
      <ul className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <Skeleton.Row />
          </li>
        ))}
      </ul>
    </div>
  );
}
