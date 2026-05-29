import Skeleton from "@/components/ui/Skeleton";

/**
 * Instant route-transition skeleton for /map.
 *
 * The map route does a heavy server fetch (traffic, 311, Mapillary,
 * trails, transit, boundaries, river gauges, the event union) before it
 * can paint, so without this the tab looked frozen on tap. This shapes
 * the page: a chip strip on top and the full-bleed map canvas filling
 * the rest, so the navigation registers instantly and the real map
 * fades in over it.
 */
export default function MapLoading() {
  return (
    <div className="-mx-4 -mt-4">
      {/* Mode + intent chip strips */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Skeleton.Block width={150} height={36} round="9999px" />
        <Skeleton.Block width={90} height={36} round="9999px" />
        <Skeleton.Block width={90} height={36} round="9999px" />
      </div>
      {/* Map canvas */}
      <div className="relative px-0">
        <Skeleton.Block
          height="calc(100dvh - 56px - 48px - 48px - env(safe-area-inset-bottom, 0px))"
          round={0}
        />
      </div>
    </div>
  );
}
