import type { Event } from "@/data/events";
import { withBrowseReturnTo } from "@/lib/browse-return";
import { isLikelyEventActionUrl } from "./attendance";
import { isGenericEventVenueName } from "./venue-name";

// Require an explicit claim of multiple places. A venue hosting several
// performances or exhibiting work from other museums is still a single stop.
const MULTIPLE_SITES = /\b(?:multiple|various|several|participating)\s+(?:historic\s+)?(?:sites|locations|venues|museums)\b|\bmulti[- ](?:site|venue)\b/i;

export function eventDetailDestinations(event: Pick<Event, "source_url" | "venue_name" | "address" | "description" | "title">, resolvedVenue?: string) {
  const multipleSites = [event.title, event.venue_name, event.description].some(value => MULTIPLE_SITES.test(value ?? ""));
  const venueName = [resolvedVenue, event.venue_name].find(value =>
    value?.trim() && !isGenericEventVenueName(value) && !MULTIPLE_SITES.test(value));
  const destination = venueName || event.address?.trim();
  const sourceHref = isLikelyEventActionUrl(event.source_url) ? event.source_url : null;
  const host = sourceHref ? new URL(sourceHref).hostname.replace(/^www\./i, "") : null;
  return {
    multipleSites,
    venueName,
    directionsLabel: destination ? `Directions to ${destination}` : "Directions to the listed location",
    hasNamedSite: Boolean(venueName || (/^\d+[a-z]?(?:-\d+)?\s+\S+/i.test(event.address?.trim()) && !MULTIPLE_SITES.test(event.address))),
    venueLabel: venueName ? `${venueName} in Radius` : "Venue details in Radius",
    sourceHref,
    // A tourism calendar may publish another organization's event.
    sourceLabel: host ? `${multipleSites ? "Check locations" : "Event listing"} on ${host}` : null,
  };
}

export function eventPlanLink(eventSlug: string, browseOrigin: unknown): string {
  const slug = encodeURIComponent(eventSlug);
  return withBrowseReturnTo(`/plan?event=${slug}`, withBrowseReturnTo(`/events/${slug}`, browseOrigin));
}
