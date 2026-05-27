/**
 * places-photos — slug → Vercel Blob URL lookup for permanent place
 * photos.
 *
 * Why this exists
 *   Google Places returns photo REFERENCES (e.g. "places/ChIJ.../
 *   photos/AfL..."), not bytes. The references rotate every few
 *   weeks. That is why the live photo proxy starts returning 400s
 *   without any code change on our side; the user-visible result is
 *   "all the photos disappeared." Permanent fix: download each
 *   reference's bytes once, upload to Vercel Blob, and serve the
 *   stable Blob URL forever after.
 *
 * Workflow
 *   1. Run `npm run download:photos` (see scripts/download-photos.ts)
 *      with BLOB_READ_WRITE_TOKEN + GOOGLE_PLACES_API_KEY set.
 *   2. The script writes src/data/places-photos.json mapping slug →
 *      Blob URL.
 *   3. The places loader reads this map and prefers the Blob URL
 *      over the rotating Google reference when present.
 *
 * Update cadence
 *   Run the script after every enrichment pass that adds new photo
 *   references. Existing Blob URLs are stable indefinitely; only new
 *   places need new uploads. The script is resumable — it only
 *   downloads slugs missing from the map.
 *
 * This module is loader-free side-data; it imports nothing and is
 * safe to use from server components, route handlers, and scripts.
 */
import RAW from "@/data/places-photos.json" assert { type: "json" };

const MAP = RAW as Record<string, string>;

/**
 * Public Blob URL for a place's hero photo, or null if the place
 * hasn't been downloaded yet. Callers fall back to the proxy URL.
 */
export function placePhotoBlob(slug: string): string | null {
  return MAP[slug] ?? null;
}

/** Count of places with downloaded blob photos — useful for telemetry. */
export function placePhotoBlobCoverage(): number {
  return Object.keys(MAP).length;
}
