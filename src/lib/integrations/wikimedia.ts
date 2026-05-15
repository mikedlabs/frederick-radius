/**
 * Wikimedia Commons photos for curated places.
 *
 * Photos must be verified-real on Wikimedia Commons. Each entry's URL
 * SHOULD return HTTP 200 from:
 *   https://commons.wikimedia.org/wiki/Special:FilePath/{file}?width={N}
 *
 * Mark each entry with a `verified` flag. Do not add unverified entries —
 * 404s create broken-image UX. Use `getLandmarkPhoto(slug)` to lookup;
 * unknown slugs return null and the PlaceCard falls back to a gradient
 * + category glyph automatically.
 *
 * If you want to add an image: search https://commons.wikimedia.org for
 * the location, copy the exact File:... name, verify the Special:FilePath
 * URL returns 200, then add an entry below with verified:true.
 */

export type WikimediaPhoto = {
  file: string;
  alt: string;
  author: string;
  license: string;
  source_url: string;
  verified: boolean;
};

// Empty by default — entries here must be re-verified before use.
// The earlier list was guessed at filenames and 404'd; we'd rather show
// the gradient glyph fallback than a broken image.
export const LANDMARK_PHOTOS: Record<string, WikimediaPhoto> = {};

export function wikimediaUrl(file: string, width = 1200): string {
  const encoded = encodeURIComponent(file);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

export function getLandmarkPhoto(slug: string): WikimediaPhoto | null {
  const p = LANDMARK_PHOTOS[slug];
  return p && p.verified ? p : null;
}
