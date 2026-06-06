import type { Metadata } from "next";
import PageBloom from "@/components/ui/PageBloom";
import FunnelFlow from "@/components/guide/FunnelFlow";
import HiddenGemsRail from "@/components/guide/HiddenGemsRail";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";

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
export default async function GuidePage() {
  // Current conditions for the funnel header. NWS is keyless + ISR-cached
  // (revalidate 30 min) and fails soft to null — the header just omits
  // weather then, never shows a fabricated temp. hourly[0] is "now".
  const fc = await getNwsForecast(FREDERICK_CENTER);
  const now = fc?.hourly?.[0];
  const weather = now
    ? { tempF: Math.round(now.temperature), condition: now.shortForecast }
    : undefined;

  return (
    <div className="relative">
      <PageBloom />
      <FunnelFlow weather={weather} />
      {/* Editorial discovery beat — a small, deliberate home for the curated
          hidden gems, below the funnel so it adds local taste without
          competing with the intent paths. */}
      <HiddenGemsRail />
    </div>
  );
}
