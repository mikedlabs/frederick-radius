import type { Metadata } from "next";
import CollectClient from "./CollectClient";

/**
 * /collect — the field-collection walkabout tool.
 *
 * A focused, full-screen tool (deliberately OUTSIDE the (app) nav shell,
 * like /admin and /beta) for walking downtown and dropping civic-amenity
 * pins onto the live map: trash cans, water fountains, benches, EV
 * chargers, outlets, dog stations, restrooms. Pick a type, line up the
 * crosshair (or use GPS), tap Add. Each point lands in the
 * `field_amenities` table and shows on /map within one revalidation.
 *
 * Passcode-gated (COLLECT_PASSCODE) and robots-blocked — it's an
 * internal contributor tool, not a public page.
 */
export const metadata: Metadata = {
  title: "Collect · Frederick Radius",
  description: "Mark civic amenities on the Frederick County map.",
  robots: { index: false, follow: false },
};

// Client-only tool (Mapbox GL + geolocation); no ISR to cache.
export const dynamic = "force-dynamic";

export default function CollectPage() {
  return <CollectClient />;
}
