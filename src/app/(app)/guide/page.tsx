import type { Metadata } from "next";
import PageBloom from "@/components/ui/PageBloom";
import FunnelFlow from "@/components/guide/FunnelFlow";
import HiddenGemsRail from "@/components/guide/HiddenGemsRail";

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
  return (
    <div className="relative">
      <PageBloom />
      <FunnelFlow />
      {/* Editorial discovery beat — a small, deliberate home for the curated
          hidden gems, below the funnel so it adds local taste without
          competing with the intent paths. */}
      <HiddenGemsRail />
    </div>
  );
}
