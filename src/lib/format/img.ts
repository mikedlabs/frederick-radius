/**
 * Build a Next image-optimizer URL for a remote/static source at a
 * bounded width.
 *
 * Map pins and popups render tiny — a 36px event dot, a ~320px aerial
 * card — but were loading full-resolution hero.jpg blobs (1–2 MB each,
 * times every visible event marker). Routing them through /_next/image
 * trims each to a few kilobytes and offloads the resize to the CDN.
 *
 * `w` MUST be one of Next's configured image widths (with our default
 * config that's the deviceSizes ∪ imageSizes set:
 * 16/32/48/64/96/128/256/384/640/750/828/1080/1200/1920/2048/3840) or
 * the optimizer responds 400. Callers pass a value from that set.
 *
 * Pass-through cases — returned unchanged: empty, data:, blob:, and
 * already-optimized (/_next/) URLs.
 */
export function sizedImage(
  url: string | undefined | null,
  w: number,
  q = 70,
): string {
  if (!url) return "";
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("/_next/")
  ) {
    return url;
  }
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;
}
