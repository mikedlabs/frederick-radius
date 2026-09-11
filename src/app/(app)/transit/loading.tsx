import PageBloom from "@/components/ui/PageBloom";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Immediate route shell for the live transit dashboard.
 *
 * The destination joins route geometry, feed freshness, and MARC data before
 * it renders. Matching the real page's header, next-ride card, stop finder,
 * and map prevents a tab tap from looking frozen while those sources load.
 */
export default function TransitLoading() {
  return (
    <div className="relative space-y-5" aria-busy="true">
      <span className="sr-only" role="status">Loading transit.</span>
      <PageBloom variant="warm-cool" />

      <header className="space-y-2" aria-hidden>
        <Skeleton.Block width={128} height={11} />
        <Skeleton.Block width={150} height={42} round="var(--app-radius-md)" />
        <Skeleton.Block width="min(100%, 31rem)" height={14} />
      </header>

      <Skeleton.Card withPhoto={false} />

      <div
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid,var(--app-bg-elevated))] p-3"
        style={{ borderColor: "var(--app-border)" }}
        aria-hidden
      >
        <Skeleton.Block width={122} height={11} />
        <Skeleton.Block className="mt-2.5" width="100%" height={44} round="var(--app-radius-sm)" />
      </div>

      <section className="space-y-2.5" aria-hidden>
        <div className="space-y-2 px-1">
          <Skeleton.Block width={116} height={18} />
          <Skeleton.Block width={265} height={12} />
        </div>
        <Skeleton.Block
          height="clamp(20rem, 44svh, 26rem)"
          round="var(--app-radius-lg)"
        />
      </section>

      <div className="space-y-2" aria-hidden>
        <Skeleton.Block height={64} round="var(--app-radius-md)" />
        <Skeleton.Block height={64} round="var(--app-radius-md)" />
      </div>
    </div>
  );
}
