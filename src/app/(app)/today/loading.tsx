import Skeleton from "@/components/ui/Skeleton";
import { currentSkyPalette } from "@/components/today/SkyHero";

/**
 * Instant route-transition skeleton for /today.
 *
 * Shaped to the real page: the cinematic sky fold (full-bleed, ~72svh)
 * with a centered glance, then the mood-tile row. Tinted to the CURRENT
 * time-of-day sky (pure hour math, no fetch) so the placeholder reads as
 * "the sky is arriving," not a generic gray box — the view transition
 * cross-fades into something that already looks like Today.
 */
export default function TodayLoading() {
  const sky = currentSkyPalette();
  return (
    <div className="space-y-6">
      {/* Fold sky */}
      <div
        className="-mx-4 -mt-4 flex min-h-[72svh] flex-col items-center justify-center gap-4 rounded-b-[var(--app-radius-xl)] px-4"
        style={{
          background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 55%, ${sky.bottom} 100%)`,
        }}
      >
        {/* Glance: big temp + condition lines, faintly washed so they
            read on the gradient regardless of sky tone. */}
        <div className="flex flex-col items-center gap-3 opacity-40">
          <Skeleton.Block width={140} height={92} round="var(--app-radius-lg)" />
          <Skeleton.Block width={180} height={16} />
          <Skeleton.Block width={120} height={12} />
        </div>
      </div>

      {/* Mood tiles — 3-up on mobile, 6-up from sm. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton.Block key={i} height={84} round="var(--app-radius-md)" />
        ))}
      </div>

      {/* A couple of below-fold section stubs. */}
      <Skeleton.Block height={120} round="var(--app-radius-lg)" />
      <Skeleton.Block height={120} round="var(--app-radius-lg)" />
    </div>
  );
}
