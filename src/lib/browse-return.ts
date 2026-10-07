import { isResolvableEventSlug } from "@/lib/events/resolvable-event-slug";
import { safeRedirectPath } from "@/lib/safe-redirect";

const BASE = new URL("https://frederick-radius.invalid");
const INVALID = "/__invalid-browse-return__";
const DESTINATIONS: Record<string, string> = {
  "/map": "map",
  "/search": "search results",
  "/events": "events",
  "/my-radius": "saved",
  "/today": "Today",
  "/today/tonight": "Tonight",
  "/plan": "your plan",
};

const isEventDetail = (path: string) => path.startsWith("/events/") && isResolvableEventSlug(path.slice("/events/".length));

/** Return only to known public browsing routes or a canonical event detail. */
export function normalizeBrowseReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 8_192) return null;
  const safe = safeRedirectPath(raw, INVALID);
  const parsed = new URL(safe, BASE);
  if (!Object.hasOwn(DESTINATIONS, parsed.pathname) && !isEventDetail(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function browseReturnLabel(raw: unknown): string | null {
  const safe = normalizeBrowseReturnTo(raw);
  if (!safe) return null;
  const path = new URL(safe, BASE).pathname;
  return isEventDetail(path) ? "Back to the event" : `Back to ${DESTINATIONS[path]}`;
}

export function withBrowseReturnTo(destination: string, raw: unknown): string {
  const returnTo = normalizeBrowseReturnTo(raw);
  if (!returnTo) return destination;
  const safeDestination = safeRedirectPath(destination, INVALID);
  if (safeDestination === INVALID) return destination;
  const parsed = new URL(safeDestination, BASE);
  parsed.searchParams.set("returnTo", returnTo);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Keep the immediate listing, including its own route back to the map. */
export function browseReturnFromLocation(location: URL): string | null {
  if (isEventDetail(location.pathname)) {
    const listing = normalizeBrowseReturnTo(location.searchParams.get("returnTo"));
    if (listing) return listing;
  }
  return normalizeBrowseReturnTo(
    `${location.pathname}${location.search}${location.hash}`,
  ) ?? normalizeBrowseReturnTo(location.searchParams.get("returnTo"));
}
