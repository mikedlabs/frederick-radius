/**
 * Publisher/feed event images. Adapters emit hero_image only for URLs that
 * pass this gate, and next/image is allowlisted for the same hosts, so a
 * surprise CDN cannot crash a card.
 *
 * Google place photos stay a fallback (withVenueThumbs) when a feed does not
 * publish a real image.
 */

export type FeedImageRemotePattern = {
  protocol: "https";
  hostname: string;
  pathname?: string;
  /** When true, the final path segment must look like an image file. */
  requiresImageExtension?: boolean;
};

/**
 * Hosts + path prefixes that may appear on an event card. Keep in sync with
 * `next.config.ts` `images.remotePatterns` — `tests/feed-image-hosts.spec.ts`
 * fails the build if a pattern here is missing there.
 */
export const FEED_IMAGE_REMOTE_PATTERNS: readonly FeedImageRemotePattern[] = [
  { protocol: "https", hostname: "s1.ticketm.net" },
  { protocol: "https", hostname: "seatgeek.com" },
  {
    protocol: "https",
    hostname: "assets.simpleviewinc.com",
    pathname: "/sv-frederick-county/image/fetch/**",
  },
  {
    protocol: "https",
    hostname: "ik.imagekit.io",
    pathname: "/vibemap/**",
  },
  {
    protocol: "https",
    hostname: "frederick.librarycalendar.com",
    pathname: "/sites/default/files/**",
  },
  {
    protocol: "https",
    hostname: "static.wixstatic.com",
    pathname: "/media/**",
  },
  { protocol: "https", hostname: "images.squarespace-cdn.com" },
  {
    protocol: "https",
    hostname: "static1.squarespace.com",
    requiresImageExtension: true,
  },
  {
    protocol: "https",
    hostname: "static.squarespace.com",
    requiresImageExtension: true,
  },
  { protocol: "https", hostname: "images.squarespace.com" },
  {
    protocol: "https",
    hostname: "www.celebratefrederick.com",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "monocacybrewing.com",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "delaplaine.org",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "www.civilwarmed.org",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "marylandensemble.org",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "catoctinlandtrust.org",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https",
    hostname: "www.frederick.edu",
    pathname: "/images/**",
  },
  {
    protocol: "https",
    hostname: "www.mountairymd.gov",
    pathname: "/calendar/**",
    requiresImageExtension: true,
  },
  {
    protocol: "https",
    hostname: "www.cityoffrederickmd.gov",
    pathname: "/calendar/**",
    requiresImageExtension: true,
  },
];

const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp)$/i;
const PLACEHOLDER_NAME_RE =
  /(?:^|[._-])(?:pixel|spacer|blank|tracking|1x1|placeholder)(?:[._-]|$)/i;
const DEFAULT_NAME_RE = /(?:^|[._-])default\.(?:png|jpe?g|gif|webp|svg)$/i;
const MIN_PUBLISHED_SIDE_PX = 32;

function pathnamePrefix(patternPath?: string): string | undefined {
  if (!patternPath) return undefined;
  return patternPath.replace(/\*\*$/, "").replace(/\*$/, "");
}

function looksLikeImageFilename(pathname: string): boolean {
  const file = pathname.split("/").pop() ?? "";
  return IMAGE_EXT_RE.test(file);
}

function isPlaceholderFilename(pathname: string): boolean {
  const file = decodeURIComponent((pathname.split("/").pop() ?? "").replace(/\+/g, " "));
  return PLACEHOLDER_NAME_RE.test(file) || DEFAULT_NAME_RE.test(file);
}

function publishedSizeTooSmall(originalSize?: string): boolean {
  if (!originalSize) return false;
  const match = originalSize.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    Math.min(width, height) < MIN_PUBLISHED_SIDE_PX
  );
}

function matchesFeedPattern(url: URL): FeedImageRemotePattern | undefined {
  return FEED_IMAGE_REMOTE_PATTERNS.find((pattern) => {
    if (url.hostname !== pattern.hostname) return false;
    const prefix = pathnamePrefix(pattern.pathname);
    if (prefix && !url.pathname.startsWith(prefix)) return false;
    if (pattern.requiresImageExtension && !looksLikeImageFilename(url.pathname)) {
      return false;
    }
    return true;
  });
}

/**
 * Return the URL only when it is https, on an allowlisted host/path, and not
 * a tracking pixel or named placeholder. Undefined otherwise.
 */
export function approvedFeedImageUrl(
  value: string | null | undefined,
  opts?: { originalSize?: string },
): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    if (
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return undefined;
    }
    if (isPlaceholderFilename(url.pathname)) return undefined;
    if (publishedSizeTooSmall(opts?.originalSize)) return undefined;
    if (!matchesFeedPattern(url)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export type SquarespaceImageItem = {
  assetUrl?: unknown;
  contentType?: unknown;
  originalSize?: unknown;
  filename?: unknown;
  systemDataSourceType?: unknown;
};

/**
 * Squarespace events collections publish the item image as `assetUrl`. Some
 * rows reuse that field for an HTML collection URL (`contentType: text/html`);
 * those are not photographs.
 */
export function squarespaceItemImage(item: SquarespaceImageItem): string | undefined {
  const contentType =
    typeof item.contentType === "string" ? item.contentType.trim().toLowerCase() : "";
  if (contentType && !contentType.startsWith("image/")) return undefined;
  const sourceType =
    typeof item.systemDataSourceType === "string"
      ? item.systemDataSourceType.trim().toUpperCase()
      : "";
  if (sourceType && !["JPG", "JPEG", "PNG", "GIF", "WEBP"].includes(sourceType)) {
    return undefined;
  }
  const originalSize =
    typeof item.originalSize === "string" ? item.originalSize : undefined;
  return approvedFeedImageUrl(
    typeof item.assetUrl === "string" ? item.assetUrl : undefined,
    { originalSize },
  );
}

/** iCal ATTACH / IMAGE values. FMTTYPE, when present, must be an image. */
export function icalAttachImage(
  fmttype: string | undefined,
  value: string,
): string | undefined {
  const type = fmttype?.trim().toLowerCase();
  if (type && !type.startsWith("image/")) return undefined;
  const raw = value.trim().replace(/^<|>$/g, "");
  if (!raw || raw.toLowerCase().startsWith("cid:") || raw.toLowerCase().startsWith("data:")) {
    return undefined;
  }
  return approvedFeedImageUrl(raw);
}

function attributeValue(attrs: string, name: string): string {
  const match = attrs.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"),
  );
  return (match?.[2] ?? match?.[3] ?? "").trim();
}

/** RSS `<enclosure>` / `<media:content>` image attachments. */
export function rssItemImage(block: string): string | undefined {
  const tags = block.matchAll(/<(?:enclosure|media:content)\b([^>]*)\/?>/gi);
  for (const tag of tags) {
    const attrs = tag[1] ?? "";
    const type = attributeValue(attrs, "type").toLowerCase();
    if (type && !type.startsWith("image/")) continue;
    const url = attributeValue(attrs, "url") || attributeValue(attrs, "href");
    const image = approvedFeedImageUrl(url);
    if (image) return image;
  }
  return undefined;
}

type TribeImageValue = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
};

/**
 * The Events Calendar REST `image` object. Relative `/wp-content/uploads`
 * paths resolve against the feed origin. Site-wide default art is dropped.
 */
export function tribeEventImage(
  image: unknown,
  feedUrl: string,
): string | undefined {
  if (!image || typeof image !== "object" || Array.isArray(image)) return undefined;
  const record = image as TribeImageValue;
  const raw = typeof record.url === "string" ? record.url.trim() : "";
  if (!raw) return undefined;
  const width = typeof record.width === "number" ? record.width : undefined;
  const height = typeof record.height === "number" ? record.height : undefined;
  if (
    width !== undefined &&
    height !== undefined &&
    Math.min(width, height) < MIN_PUBLISHED_SIDE_PX
  ) {
    return undefined;
  }
  try {
    const resolved = new URL(raw, feedUrl).toString();
    return approvedFeedImageUrl(resolved);
  } catch {
    return undefined;
  }
}
