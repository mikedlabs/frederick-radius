import type { Metadata } from "next";
import { Suspense } from "react";
import PageBloom from "@/components/ui/PageBloom";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";
import FunnelFlow from "@/components/guide/FunnelFlow";
import HiddenGemsRail from "@/components/guide/HiddenGemsRail";
import { liveDowntownShows } from "@/lib/guide/live-downtown";

export const metadata: Metadata = {
  alternates: { canonical: "/guide" },
  title: "What are you after?",
  description:
    "Tell Frederick Radius what you're after and it narrows, tap by tap, to the answer — no map, no menu to read.",
};

/**
 * /guide — the funnel front door (UX_REDO, the answer-first entry).
 *
 * The interactive "what are you after?" narrowing: intent → kind →
 * matched places, built on the real INTENTS data + client place set.
 * New route on purpose; /today and /find are left untouched until this
 * proves the direction.
 */
export default function GuidePage() {
  // The three flagship downtown stage programs (Alive @ Five, the
  // Weinberg, SilverVox), soonest-show-first, for the front-door marquee.
  // Computed from data we already hold; the client formats the dates.
  const liveShows = liveDowntownShows();
  return (
    <div className="relative">
      <PageBloom />

      {/* THE FRONT DOOR OPENS ON FREDERICK (redo pass, owner directive:
          "it needs a redo" — the page was a beige form with zero place
          identity). The same curated SeasonalPhoto system as the town +
          category heroes: the county itself, full-bleed, with the brand
          line. The funnel's question + needs follow as the action block. */}
      <header className="relative -mx-4 -mt-4 mb-4 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-[var(--app-radius-lg)]">
        <div className="relative h-40 w-full sm:h-52 lg:h-64">
          <SeasonalPhoto
            season="auto"
            alt="Frederick County, Maryland"
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
              Frederick County · Field guide
            </p>
            <p className="mt-1 font-serif text-[22px] font-semibold leading-tight tracking-tight text-white sm:text-[26px]">
              One guide for the city and the towns around it.
            </p>
          </div>
        </div>
      </header>
      {/* Suspense: FunnelFlow reads useSearchParams (the guided-flow
          step lives in the URL now), which suspends during streaming. */}
      <Suspense fallback={null}>
        <FunnelFlow liveShows={liveShows} />
      </Suspense>
      {/* Editorial discovery beat — a small, deliberate home for the curated
          hidden gems, below the funnel so it adds local taste without
          competing with the intent paths. */}
      <HiddenGemsRail />
    </div>
  );
}
