import Skeleton from "@/components/ui/Skeleton";

/**
 * Immediate route shell for the food-truck board.
 *
 * The real page waits on published schedules and optional live beacons. This
 * preserves its headline, journey switcher, and weekly board geometry while
 * those independent sources settle. The featured-truck strip closes the real
 * page far below the last placeholder, so it has no stand-in here.
 */
export default function FoodTrucksLoading() {
  return (
    <div className="relative space-y-5 sm:space-y-6" aria-busy="true">
      <span className="sr-only" role="status">Loading food trucks.</span>

      {/* `block!` matches the real page, which drops the masthead's empty
          second grid track. */}
      <header className="food-truck-masthead block!">
        {/* The margins repeat the real copy block's rhythm so the journey
            switcher does not move when the page replaces this shell. A grid
            keeps those margins from collapsing into each other. */}
        <div className="food-truck-masthead-copy grid">
          <Skeleton.Block className="my-[2.5px]" width={190} height={11} />
          {/* Two lines of the display headline. `--h1` repeats the headline's
              two font-size ramps from globals.css, and 1.82 is two lines at
              its .91 line height. */}
          <Skeleton.Block
            className="mt-[.6rem] [--h1:clamp(2.4rem,11vw,3rem)] min-[481px]:[--h1:clamp(2.75rem,8vw,5.2rem)]"
            width="min(100%, 18rem)"
            height="calc(var(--h1) * 1.82)"
            round="var(--app-radius-md)"
          />
          {/* The intro wraps to a second line only at phone widths. */}
          <div className="mt-3 grid gap-1.5 py-[3px] min-[481px]:mt-4">
            <Skeleton.Block width="min(100%, 30rem)" height={14} />
            <Skeleton.Block className="min-[466px]:hidden" width="min(60%, 18rem)" height={14} />
          </div>
        </div>
      </header>

      <div className="grid gap-4" aria-hidden>
        <Skeleton.Block width="100%" height={52} round="9999px" />

        <section className="min-w-0 space-y-4">
          <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton.Block width="min(100%, 210px)" height={10} />
              {/* The source line wraps beside the checked time on a phone. */}
              <Skeleton.Block className="min-[466px]:hidden" width={90} height={10} />
              <Skeleton.Block width="min(100%, 190px)" height={30} round="var(--app-radius-sm)" />
            </div>
            <div className="shrink-0 space-y-1">
              <Skeleton.Block width={80} height={10} />
              <Skeleton.Block width={56} height={10} />
            </div>
          </div>
          <div className="food-truck-stop-grid">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        </section>
      </div>
    </div>
  );
}
