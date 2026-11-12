import type { Hours } from "@/data/places";
import { isDisplayOnlyHours, type OpenStatus } from "@/lib/hours";
import { hasQualifiedHoursOwner } from "@/lib/qualified-hours-sources";

/**
 * Curated posted-hours windows are a fallback only. They may fill an unknown
 * status, but they must never override a fresh confirmed open or closed state.
 * A known qualified source stays excluded even after its display table expires.
 */
export function mayUseLikelyOpenFallback(status: OpenStatus, place?: { slug?: string; hours?: Hours }): boolean {
  if (hasQualifiedHoursOwner(place?.slug) || isDisplayOnlyHours(place?.hours)) return false;
  return status.state === "unknown" || status.state === "unverified";
}
