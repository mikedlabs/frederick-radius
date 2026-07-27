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
 * Pass-through cases: empty, data:, blob:, already-optimized (/_next/),
 * and the same-origin place-photo proxy. The proxy already accepts a width
 * and may return an SVG fallback; routing that fallback through /_next/image
 * makes Next reject it with a 400.
 */
/**
 * Narrow the place-photo proxy to the size actually being painted, for
 * callers that render through `next/image` rather than a raw `<img>`.
 *
 * Use this, NOT `sizedImage`, whenever the URL is going into an `<Image>`:
 * `sizedImage` wraps non-proxy URLs in `/_next/image`, and handing that to
 * `<Image>` optimizes an already-optimized URL. This touches only the proxy
 * and returns everything else untouched, because `<Image>` already resizes
 * Blob and remote sources correctly from `sizes`.
 *
 * Why it is needed at all: `places-client.json` stores one URL per place at
 * `w=800` (the size a hero needs), and proxy responses render with
 * `unoptimized` because Next cannot resize an opaque route. So a 40px
 * PlaceMedallion downloaded the full 800px asset, dozens of times per scroll
 * across Saved, deals, happy hour, pools, beer, live music and the planner.
 *
 * Renders for 2x. Phones ship 3x panels, but at medallion sizes the extra
 * bytes buy detail nobody can see.
 */
export function proxyPhotoAtWidth(url: string, cssWidth: number): string {
  if (url !== "/api/place-photo" && !url.startsWith("/api/place-photo?")) return url;
  // The route clamps w to [80, 1600]; mirror it so we never send a request it
  // silently widens back.
  const wanted = Math.min(1600, Math.max(80, Math.round(cssWidth * 2)));
  const proxyUrl = new URL(url, "https://frederickradius.invalid");
  const current = Number.parseInt(proxyUrl.searchParams.get("w") ?? "", 10);
  // Never upscale: a bigger thumbnail costs bytes for detail the source may
  // not even have.
  if (Number.isFinite(current) && current <= wanted) return url;
  proxyUrl.searchParams.set("w", String(wanted));
  return `${proxyUrl.pathname}${proxyUrl.search}${proxyUrl.hash}`;
}

export function sizedImage(
  url: string | undefined | null,
  w: number,
  q = 70,
): string {
  if (!url) return "";
  if (
    url === "/api/place-photo" ||
    url.startsWith("/api/place-photo?")
  ) {
    const proxyUrl = new URL(url, "https://frederickradius.invalid");
    proxyUrl.searchParams.set("w", String(w));
    return `${proxyUrl.pathname}${proxyUrl.search}${proxyUrl.hash}`;
  }
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("/_next/")
  ) {
    return url;
  }
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;
}
