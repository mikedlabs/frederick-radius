import type { Metadata } from "next";
import CollectClient from "./CollectClient";

/**
 * /collect — the field-collection walkabout tool.
 *
 * A focused, full-screen tool (deliberately OUTSIDE the (app) nav shell,
 * like /admin and /beta) for walking downtown and dropping civic-amenity
 * pins onto the live map: trash cans, water fountains, benches, EV
 * chargers, outlets, dog stations, restrooms. Two modes:
 *
 *   Aim  — stand still, line the crosshair up, tap Add (the original flow).
 *   Ride — for a scooter or bike: a live GPS watch follows you, the screen
 *          stays awake, and each type button is a one-tap tag at your
 *          current fix. Tags queue locally and send in the background, so
 *          dead spots on the ride never lose a point.
 *
 * Each point lands in the `field_amenities` table and shows on /map
 * within one revalidation.
 *
 * Passcode-gated (COLLECT_PASSCODE) and robots-blocked — it's an
 * internal contributor tool, not a public page.
 */
export const metadata: Metadata = {
  title: "Collect · Frederick Radius",
  description: "Use the Frederick County map to mark civic amenities.",
  robots: { index: false, follow: false },
};

// Client-only tool (Mapbox GL + geolocation); no ISR to cache.
export const dynamic = "force-dynamic";

export default function CollectPage() {
  return <CollectClient />;
}
