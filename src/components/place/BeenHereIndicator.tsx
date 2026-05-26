"use client";

import { useRecentPlaces } from "@/hooks/useRecentPlaces";

/**
 * Inline "Seen recently" hint that renders when the user has opened
 * this place's detail before (via PlaceSheet or the /places/[slug]
 * page). Reads the client-side recent-places store; returns null on
 * the server and pre-mount so SSR stays clean and consistent.
 *
 * Honest about the data it speaks to: the recent-places store tracks
 * which detail sheets the user opened, not which doors they walked
 * through. "Seen recently" is the closest accurate copy — "Visited"
 * would imply a physical visit the app can't possibly know about.
 *
 * Emits a leading " · " separator so the indicator slots into an
 * existing `category · distance` metadata line without callers having
 * to manage spacing. When the slug isn't in the recent set, returns
 * nothing — no whitespace artifact in the parent string.
 */
export function BeenHereIndicator({ slug }: { slug: string }) {
  const recent = useRecentPlaces();
  if (!recent.includes(slug)) return null;
  return <> · Seen recently</>;
}
