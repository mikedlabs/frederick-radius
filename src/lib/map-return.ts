import { safeRedirectPath } from "@/lib/safe-redirect";

const MAP_RETURN_FALLBACK = "/__invalid-map-return__";
const RETURN_BASE = new URL("https://frederick-radius.invalid");
const MAX_RETURN_LENGTH = 4_096;

/**
 * Accept only a same-origin Frederick Radius map path.
 *
 * `returnTo` crosses several client/server seams and eventually becomes a
 * clickable link. Keep the exact map query/hash when it is safe, but reject
 * absolute URLs, protocol-relative URLs, lookalike paths, and oversized input.
 */
export function normalizeMapReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RETURN_LENGTH) {
    return null;
  }

  const safe = safeRedirectPath(raw, MAP_RETURN_FALLBACK);
  if (safe === MAP_RETURN_FALLBACK) return null;

  const parsed = new URL(safe, RETURN_BASE);
  if (parsed.origin !== RETURN_BASE.origin || parsed.pathname !== "/map") {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Add a validated map return path to a known in-app destination. */
export function withMapReturnTo(destination: string, rawReturnTo: unknown): string {
  const returnTo = normalizeMapReturnTo(rawReturnTo);
  if (!returnTo) return destination;

  const parsed = new URL(destination, RETURN_BASE);
  if (parsed.origin !== RETURN_BASE.origin) return destination;
  parsed.searchParams.set("returnTo", returnTo);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Full search already owns the authoritative query. Merge it into a valid map
 * return path so a delayed map URL effect cannot make the return feel blank.
 */
export function withMapSearchQuery(
  rawReturnTo: unknown,
  rawQuery: unknown,
): string | null {
  const returnTo = normalizeMapReturnTo(rawReturnTo);
  if (!returnTo) return null;

  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 160) : "";
  if (!query) return returnTo;

  const parsed = new URL(returnTo, RETURN_BASE);
  parsed.searchParams.set("q", query);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
