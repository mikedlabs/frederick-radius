import type { Metadata } from "next";
import CompassHub from "@/components/nav/CompassHub";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/compass" },
  title: "Compass",
  description:
    "Find what you need across Frederick County: what is open, what is happening, local guides, practical tools, and ways to contribute.",
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
