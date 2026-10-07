import Skeleton from "@/components/ui/Skeleton";

/**
 * Today's route-change placeholder, shaped like the arrival it precedes so
 * nothing jumps when the page lands: the 160px photo band, the Find
 * launcher, and the four shortcut rows, on the plain Cream canvas.
 *
 * /today is a static (ISR) route, so this boundary only shows during client
 * navigation; the prerendered page still ships complete HTML. (The
 * events/[slug] no-loading rule is about soft 404s on an open slug set and
 * does not apply here.)
 */
export default function TodayLoading() {
  return (
    <div data-today-loading aria-busy="true" className="pb-6">
      <Skeleton.Block
        className="mb-4 mt-2"
        height={160}
        round="var(--app-radius-lg)"
      />
      <Skeleton.Block height={92} round="var(--app-radius-md)" />
      <div className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton.Block key={index} height={64} round="var(--app-radius-sm)" />
        ))}
      </div>
      <p role="status" className="text-[15px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        Checking what is open around the county.
      </p>
    </div>
  );
}
