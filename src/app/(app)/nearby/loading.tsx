import Skeleton from "@/components/ui/Skeleton";

/**
 * Instant route-transition skeleton for /nearby.
 *
 * /nearby is force-dynamic (open-now is computed live, never cached), so a
 * craving tap from the /today strip otherwise waited on the full server render
 * — decorate + rank ~300 places — against a blank screen. This shapes the wait
 * to the RESULTS view the craving chips deep-link into (`/nearby?c=…`): a back
 * stub, the active-craving header, a facet-chip row, and a list of place rows,
 * so the tap reads as instant and cross-fades into the real answer.
 */
export default function NearbyLoading() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        {/* Back link */}
        <Skeleton.Block width={104} height={26} round="999px" />
        {/* Active craving: icon tile + title + sub */}
        <div className="flex items-center gap-2.5">
          <Skeleton.Block width={40} height={40} round="var(--app-radius-md)" />
          <div className="space-y-1.5">
            <Skeleton.Block width={150} height={20} />
            <Skeleton.Block width={110} height={12} />
          </div>
        </div>
        {/* Facet chips */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {[72, 92, 64, 80].map((w, i) => (
            <Skeleton.Block key={i} width={w} height={28} round="999px" />
          ))}
        </div>
      </header>
      {/* Nearest-open results */}
      <ul className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <Skeleton.Row />
          </li>
        ))}
      </ul>
    </div>
  );
}
