"use client";

import { useEffect } from "react";
import { usePushRecentPlace } from "@/hooks/useRecentPlaces";

/**
 * PlaceVisitTracker — fire-and-forget client island dropped on
 * /places/[slug] that records the slug to the device-local
 * recent-places list. PlaceSheetProvider already does this for the
 * in-map place sheet path; this covers the direct page-visit path
 * (deep links, shares, search hits) so /my-radius shows the right
 * recent set regardless of how someone got to a place.
 *
 * Renders nothing.
 */
export default function PlaceVisitTracker({ slug }: { slug: string }) {
  const push = usePushRecentPlace();
  useEffect(() => {
    if (slug) push(slug);
  }, [slug, push]);
  return null;
}
