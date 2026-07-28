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
      <CompassHub />
    </div>
  );
}
