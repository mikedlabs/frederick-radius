import { safeRedirectPath } from "@/lib/safe-redirect";

const BASE = new URL("https://frederick-radius.invalid");
const INVALID = "/__invalid-browse-return__";
const DESTINATIONS: Record<string, string> = {
  "/map": "map",
  "/search": "search results",
  "/events": "events",
  "/my-radius": "saved",
  "/today": "Today",
  "/plan": "your plan",
};

/** A detail can return to a known listing, never to an arbitrary redirect. */
export function normalizeBrowseReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 8_192) return null;
  const safe = safeRedirectPath(raw, INVALID);
  const parsed = new URL(safe, BASE);
  if (!Object.hasOwn(DESTINATIONS, parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function browseReturnLabel(raw: unknown): string | null {
  const safe = normalizeBrowseReturnTo(raw);
  return safe ? `Back to ${DESTINATIONS[new URL(safe, BASE).pathname]}` : null;
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
  return normalizeBrowseReturnTo(
    `${location.pathname}${location.search}${location.hash}`,
  ) ?? normalizeBrowseReturnTo(location.searchParams.get("returnTo"));
}
