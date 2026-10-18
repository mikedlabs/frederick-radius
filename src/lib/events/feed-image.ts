/** Publisher event artwork is not verified venue photography or a free-license record.
 * This initial Squarespace account is supported by the preserved Steinhardt feed
 * fixture and the reviewed collection in live-music-venues.ts. A shared CDN host
 * alone never makes another publisher/account eligible. */
export const STEINHARDT_EVENT_ART = {
  venueSlug: "steinhardt-brewing-company-frederick",
  collectionUrl: "https://www.steinhardtbrewing.com/live-music-events",
  hostname: "images.squarespace-cdn.com",
  pathnamePrefix: "/content/v1/5f9ef850cc5c2c1189e6fb4a/",
  caption: "Event image · Steinhardt Brewing Company",
} as const;

export type SquarespaceImageItem = {
  assetUrl?: unknown;
  contentType?: unknown;
  originalSize?: unknown;
  filename?: unknown;
  systemDataSourceType?: unknown;
};

const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif|webp)$/i;
const PLACEHOLDER_NAME = /(?:^|[._ -])(?:pixel|spacer|blank|tracking|1x1|placeholder)(?:[._ -]|$)/i;
const DEFAULT_NAME = /(?:^|[._ -])default\.(?:png|jpe?g|gif|webp|svg)$/i;

/** Validate both the official collection and its exact image account. No host-only
 * gate is exported for use by unrelated event sources. */
export function approvedVenueFeedImage(
  value: unknown,
  collectionUrl: string | undefined,
  venueSlug: string | undefined,
): string | undefined {
  if (typeof value !== "string" || !collectionUrl || venueSlug !== STEINHARDT_EVENT_ART.venueSlug) return undefined;
  try {
    const collection = new URL(collectionUrl);
    const expected = new URL(STEINHARDT_EVENT_ART.collectionUrl);
    if (collection.origin !== expected.origin ||
      collection.pathname.replace(/\/$/, "") !== expected.pathname ||
      collection.search || collection.hash || collection.username || collection.password) return undefined;
    const image = new URL(value.trim());
    if (image.protocol !== "https:" || image.hostname !== STEINHARDT_EVENT_ART.hostname ||
      image.port || image.username || image.password || image.hash ||
      !image.pathname.startsWith(STEINHARDT_EVENT_ART.pathnamePrefix) || /%2f|%5c/i.test(image.pathname)) return undefined;
    const decoded = decodeURIComponent(image.pathname);
    if (decoded.split("/").some((part) => part === "." || part === ".." || part.includes("\\"))) return undefined;
    const filename = decoded.split("/").pop()!.replace(/\+/g, " ");
    if (!IMAGE_EXTENSION.test(filename) || PLACEHOLDER_NAME.test(filename) || DEFAULT_NAME.test(filename)) return undefined;
    return image.href;
  } catch {
    return undefined;
  }
}

/** Reuse PR1832's assetUrl extraction and HTML/pixel rejection, with the missing
 * collection/account boundary restored. Unknown collections remain image-free. */
export function squarespaceItemImage(
  item: SquarespaceImageItem,
  collectionUrl?: string,
): string | undefined {
  const type = typeof item.contentType === "string" ? item.contentType.trim().toLowerCase() : "";
  if (type && !["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"].includes(type)) return undefined;
  const sourceType = typeof item.systemDataSourceType === "string" ? item.systemDataSourceType.trim().toUpperCase() : "";
  if (sourceType && !["JPG", "JPEG", "PNG", "GIF", "WEBP"].includes(sourceType)) return undefined;
  if (typeof item.originalSize === "string" && item.originalSize.trim()) {
    const size = item.originalSize.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!size || !size.slice(1).every((side) => Number.isFinite(Number(side)) && Number(side) >= 32)) return undefined;
  }
  return approvedVenueFeedImage(item.assetUrl, collectionUrl, STEINHARDT_EVENT_ART.venueSlug);
}
