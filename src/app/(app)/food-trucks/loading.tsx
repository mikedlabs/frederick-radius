import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Immediate route shell for the food-truck board.
 *
 * The real page waits on published schedules and optional live beacons. This
 * preserves its masthead, featured-truck strip, journey switcher, and weekly
 * board geometry while those independent sources settle.
 */
export default function FoodTrucksLoading() {
  return (
    <div className="relative space-y-5 sm:space-y-6" aria-busy="true">
      <span className="sr-only" role="status">Loading food trucks.</span>
      <PageBloom variant="single" />

      <header className="food-truck-masthead">
        <div className="food-truck-masthead-copy space-y-3">
          <Skeleton.Block width={190} height={11} />
          <Skeleton.Block width="min(100%, 23rem)" height={42} round="var(--app-radius-md)" />
          <Skeleton.Block width="min(100%, 30rem)" height={14} />
        </div>
        <div className="food-truck-hero-lineup" aria-hidden>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton.Block
              key={index}
              className="food-truck-hero-tile"
              height={112}
              round="var(--app-radius-md)"
            />
          ))}
        </div>
      </header>

      <div className="flex gap-2" aria-hidden>
        <Skeleton.Block width={96} height={40} round="9999px" />
        <Skeleton.Block width={110} height={40} round="9999px" />
        <Skeleton.Block width={104} height={40} round="9999px" />
      </div>

      <section className="space-y-4" aria-hidden>
        <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="space-y-2">
            <Skeleton.Block width={210} height={10} />
            <Skeleton.Block width={190} height={30} round="var(--app-radius-sm)" />
          </div>
          <div className="space-y-1">
            <Skeleton.Block width={80} height={10} />
            <Skeleton.Block width={56} height={10} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      </section>
    </div>
  );
}
