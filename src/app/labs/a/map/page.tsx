import { rankPlaces } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import MapA, { type MapPin } from "./MapA";

export const dynamic = "force-dynamic";

export default function LabAMap() {
  const now = new Date();
  // The map plots the curated, recommendable set so it never fills with the
  // phone-book tail. Open places draw dark, closed ones recede.
  const places = rankPlaces({ origin: FREDERICK_CENTER, now, profile: "visitor", limit: 140 });
  const pins: MapPin[] = places.map((p) => ({
    slug: p.slug,
    name: p.name,
    lng: p.geom.lng,
    lat: p.geom.lat,
    open: p.open_status.state === "open" || p.open_status.state === "closing-soon",
    category: p.category,
  }));
  return <MapA pins={pins} />;
}
