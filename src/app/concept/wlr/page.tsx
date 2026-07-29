import type { Metadata } from "next";
import WlrRoadReady, {
  type WlrConceptLocation,
} from "@/components/wlr/WlrRoadReady";
import { getPlaceBySlug } from "@/lib/loaders/places";

export const metadata: Metadata = {
  title: "WLR Road Ready concept",
  description:
    "A private discussion concept showing how Frederick Radius could turn WLR Automotive Group's Frederick locations into a useful car-care tool.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Car care, without the hunt.",
    description:
      "See how Frederick Radius could make WLR car care easier to find and use.",
    url: "/concept/wlr",
  },
};

const WLR_SLUGS = [
  "route-40-lube-center-frederick",
  "route-85-lube-center-frederick",
  "jefferson-street-lube-center-frederick",
  "frederick-auto-repair",
  "frederick-auto-spa-route-40",
  "frederick-auto-spa-express-route-85",
  "frederick-auto-spa-express-route-26",
] as const;

function serviceFor(
  subcategories: readonly string[] | undefined,
): WlrConceptLocation["service"] {
  if (subcategories?.includes("car-wash")) return "wash";
  if (subcategories?.includes("oil-change")) return "lube";
  return "repair";
}

export default function WlrConceptPage() {
  const locations = WLR_SLUGS.flatMap((slug) => {
    const place = getPlaceBySlug(slug);
    if (!place) return [];
    return [{
      slug: place.slug,
      name: place.name,
      service: serviceFor(place.subcategories),
      address: `${place.address}, ${place.city}, ${place.state} ${place.postal_code}`,
      phone: place.phone ?? "",
      website: place.website ?? "",
      geom: place.geom,
      hours: place.hours,
      hoursVerified: place.hours_verified === true,
      blurb: place.short_blurb,
    } satisfies WlrConceptLocation];
  });

  return <WlrRoadReady locations={locations} />;
}
