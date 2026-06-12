"use client";

import { useEffect } from "react";
import { usePushRecentPlace } from "@/hooks/useRecentPlaces";
import { track } from "@/lib/posthog";

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
// Module-level guard so dev StrictMode's double-mounted effect does
// not double-count the view (the recents push is idempotent and
// keeps its original behavior).
let lastTracked = "";

export default function PlaceVisitTracker({ slug }: { slug: string }) {
  const push = usePushRecentPlace();
  useEffect(() => {
    if (slug) {
      push(slug);
      if (slug !== lastTracked) {
        lastTracked = slug;
        // Session 0 measurement: covers deep links, shares, search hits.
        track.placeViewed({ slug, via: "page" });
      }
    }
  }, [slug, push]);
  return null;
}
