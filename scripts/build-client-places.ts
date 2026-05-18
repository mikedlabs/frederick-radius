/**
 * Build src/data/places-client.json — a SLIM, already-decorated public
 * place set for CLIENT use (Search, Saved).
 *
 * Why: client components must never import @/lib/loaders/places — it
 * static-imports the ~12MB places-enrichment.json and webpack bundles
 * that into the browser (a 13MB chunk that hangs the page). This
 * pre-decorates server-side and drops the heavy per-place arrays the
 * cards/search never read (google_photos[], google_hours[],
 * review_snippet/author — those are place-detail only). Re-runnable:
 * `npm run build:client-places`.
 */
import { writeFileSync } from "node:fs";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";

const OUT = new URL("../src/data/places-client.json", import.meta.url).pathname;

const slim = publicPlaces().map((p) => {
  const d = decoratePlace(p) as PlaceCardData & {
    google_photos?: unknown;
    google_hours?: unknown;
    review_snippet?: unknown;
    review_author?: unknown;
  };
  // Keep google_photo_url (the single hero); drop the heavy arrays /
  // detail-only text the Search & Saved cards never render.
  const {
    google_photos: _gp,
    google_hours: _gh,
    review_snippet: _rs,
    review_author: _ra,
    ...rest
  } = d;
  void _gp; void _gh; void _rs; void _ra;
  return rest;
});

writeFileSync(OUT, JSON.stringify(slim));
const bytes = Buffer.byteLength(JSON.stringify(slim));
console.log(`wrote ${OUT} — ${slim.length} places, ${(bytes / 1_000_000).toFixed(2)} MB`);
