import type { Metadata } from "next";
import RadiusGesture, { type RadiusPlace } from "@/components/radius/RadiusGesture";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { nearestAerial, currentSeason } from "@/lib/aerial";

/**
 * /radius — PROTOTYPE of the signature gesture: a literal radius you drag
 * out from where you stand; the map + guide repopulate LIVE by real
 * distance as it grows and shrinks. The product's name becomes its
 * mechanic. Non-glass atlas language. Outside (app), full-bleed, noindex.
 */
export const metadata: Metadata = {
  title: "The Radius (prototype)",
  robots: { index: false, follow: false },
};
export const revalidate = 600;

// Curated, distance-spread places (downtown-centered → out to the towns)
// so expanding the ring includes them in real order.
const PLACES: RadiusPlace[] = [
  { name: "Carroll Creek Linear Park", category: "Park", color: "#2E7D46", mi: 0.2 },
  { name: "Civil War Medicine Museum", category: "Museum", color: "#8A3E7C", mi: 0.3 },
  { name: "Dream Free Art", category: "Gallery", color: "#7A3A93", mi: 0.4 },
  { name: "Frederick Magic Theater", category: "Theater", color: "#6A3A96", mi: 0.5 },
  { name: "K Town Takeout", category: "Restaurant", color: "#B5502F", mi: 0.7 },
  { name: "Rosati's Pizza", category: "Pizza", color: "#A8462C", mi: 1.3 },
  { name: "Pathfinder Distillery", category: "Bar", color: "#9A3A66", mi: 2.1 },
  { name: "Deb's Artisan Bakehouse", category: "Bakery", color: "#C26B3C", mi: 6.5 },
  { name: "Stone Silo Brewery", category: "Brewery", color: "#BE8420", mi: 9.0 },
  { name: "Rivers Edge Trails", category: "Trail", color: "#2E7D32", mi: 9.5 },
  { name: "Back Street Brews", category: "Coffee", color: "#8A6038", mi: 10 },
  { name: "Moon Valley Farm", category: "Market", color: "#C07A12", mi: 12 },
  { name: "Georges on York Inn", category: "Stay", color: "#7A2E72", mi: 21 },
];

export default function RadiusPage() {
  const fred = MUNICIPALITY_BY_SLUG["frederick"];
  const aerial = nearestAerial(fred?.centroid ?? { lng: -77.41, lat: 39.41 }, {
    maxMeters: 4000,
    preferSeason: currentSeason(),
  });
  return <RadiusGesture places={PLACES} aerialSrc={aerial?.src ?? "/images/seasons/fall/043.jpg"} />;
}
