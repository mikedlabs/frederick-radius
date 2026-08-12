import "server-only";

import { getPlaceBySlug } from "@/lib/loaders/places";

/** Server boundary that keeps the full place catalog out of client modules. */
export function ownerListingPlaceForSlug(slug: string) {
  return getPlaceBySlug(slug);
}
