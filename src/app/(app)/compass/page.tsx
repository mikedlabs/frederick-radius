import type { Metadata } from "next";
import CompassHub from "@/components/nav/CompassHub";
import PageBloom from "@/components/ui/PageBloom";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata: Metadata = {
  alternates: { canonical: "/compass" },
  title: PRODUCT_NAMES.allTools.pageTitle,
  description: PRODUCT_NAMES.allTools.description,
};

/**
 * /compass — the county-wide wayfinding hub.
 *
 * This intentionally lives on a full page rather than in the old tall drawer.
 * The surface has enough jobs to deserve history, a shareable URL, normal
 * scrolling, and a reliable Back path. CompassHub keeps the useful client-side
 * touches (global search + the user's home-town shortcut) isolated from the
 * page shell and metadata.
 */
export default function CompassPage() {
  return (
    <div className="relative">
      <PageBloom variant="warm" />
      {/* The live deck was mounted here and is pulled back out (owner call,
          2026-07-28: "this looks bad and not what i want at all"). It failed
          on its own terms, not just on taste: twenty near-identical squares
          whose headline was a count each, when the brand guide says counts
          are supporting detail and never the headline, and half of them read
          "None" or "Clear" outside business hours, so the board was a wall of
          nothing at exactly the times someone would check it.
          src/lib/deck/readings.ts stays: ten verified county feeds with
          honest unavailable states are worth keeping for whatever presents
          them next. /api/deck still serves it. */}
      <CompassHub />
    </div>
  );
}
