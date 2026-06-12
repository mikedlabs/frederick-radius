"use client";

import { useEffect } from "react";
import { track } from "@/lib/posthog";

/**
 * EventViewTracker — fire-and-forget client island dropped on
 * /events/[slug] (Session 0 measurement). The detail page is the one
 * point every entry path converges on (card taps, deep links, shares,
 * search hits), and non-canonical live-event slugs 307 to the
 * canonical URL before this mounts, so each view fires once. Modeled
 * on PlaceVisitTracker; the effect keys on slug so client-side
 * navigation between events re-fires.
 *
 * Renders nothing.
 */
// Module-level last-fired guard: dev StrictMode double-mounts effects,
// which would double-count every view in development. A→B→A still
// re-fires correctly because the guard tracks only the previous slug.
let lastFired = "";

export default function EventViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (slug && slug !== lastFired) {
      lastFired = slug;
      track.eventViewed({ slug });
    }
  }, [slug]);
  return null;
}
