import Skeleton from "@/components/ui/Skeleton";

/**
 * Instant route skeleton for /guide (the funnel front door — the most
 * tapped tab). Shaped to the real screen: the "right now" header row,
 * the display title, the situational chips, and the 2-col intent grid —
 * so tapping Find cross-fades into something that already looks like the
 * funnel instead of a white flash (the gap the motion audit flagged).
 */
export default function GuideLoading() {
  return (
    <div className="mx-auto w-full max-w-screen-sm px-4 pb-28 pt-3" aria-hidden>
      {/* top row: now-line · search */}
      <div className="flex items-center justify-between pb-2" style={{ minHeight: 34 }}>
        <Skeleton.Block width={150} height={13} />
        <Skeleton.Block width={92} height={13} />
      </div>

      {/* header: eyebrow · display title · sub */}
      <div className="pb-5">
        <Skeleton.Block width={120} height={11} />
        <div className="mt-2">
          <Skeleton.Block width={240} height={34} round="var(--app-radius-md)" />
        </div>
        <div className="mt-2">
          <Skeleton.Block width={200} height={14} />
        </div>
      </div>

      {/* "good right now" chips */}
      <div className="mb-4 flex gap-2">
        <Skeleton.Block width={128} height={32} round="9999px" />
        <Skeleton.Block width={96} height={32} round="9999px" />
      </div>

      {/* intent grid — 2-up tiles at the real min-height */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton.Block key={i} height={150} round="var(--app-radius-lg)" />
        ))}
      </div>
    </div>
  );
}
