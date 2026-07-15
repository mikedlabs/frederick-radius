/**
 * Build src/data/places-client.json — a SLIM, already-decorated public
 * place set for CLIENT use (Search, Saved, Map, ⌘K palette).
 *
 * Why: client components must never import @/lib/loaders/places — it
 * static-imports the ~12MB places-enrichment.json and webpack bundles
 * that into the browser (a 13MB chunk that hangs the page). This
 * pre-decorates server-side and drops the heavy per-place arrays the
 * cards/search never read (google_photos[], google_hours[],
 * review_snippet/author — those are place-detail only).
 *
 * CRITICAL: This output reflects the dedup state at build time.
 * If you edit places-dedup.json (or run gen:dedup), this script
 * MUST be re-run — otherwise the client surfaces (map, search,
 * saved) will show the orphaned duplicate slugs that the server
 * loader correctly drops. Symptom: same place listed twice on the
 * map even though /places/[slug] only resolves to one. Always
 * regenerate with: `npm run build:client-places`.
 */
import { writeFileSync } from "node:fs";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";

const OUT = new URL("../src/data/places-client.json", import.meta.url).pathname;

const slim = publicPlaces().map((p) => {
  const d = decoratePlace(p) as PlaceCardData & {
    google_photos?: unknown;
    google_photo_attributions?: unknown;
    google_hours?: unknown;
    review_snippet?: unknown;
    review_author?: unknown;
    review_author_uri?: unknown;
    review_author_photo_uri?: unknown;
    review_google_maps_uri?: unknown;
    google_maps_uri?: unknown;
    source_url?: unknown;
    license?: unknown;
    source_id?: unknown;
    confidence?: unknown;
    first_seen_at?: unknown;
    hours_source?: unknown;
    open_status?: unknown;
  };
  // Keep google_photo_url (the single hero); drop the heavy arrays /
  // detail-only text the Search & Saved cards never render.
  //
  // Also drop the provenance + most of the hours-metadata block. These fields
  // are re-DERIVED at render time on the place-detail page (which uses
  // the full @/lib/loaders/places loader, not this slim bundle) by
  // stampPlaceProvenance / applyEnrichment — no client place surface
  // (map, search, ⌘K, Saved, funnel, radius, the by-slugs hydration)
  // reads them off a slim record. `hours_updated_at` is the one exception:
  // the lightweight /api/want route needs it to enforce the same open-now
  // freshness policy without importing the 9 MB enrichment loader. Dropping
  // the rest trims ~465 KB raw /
  // ~28 KB gzip off the bundle AND off every /api/places/by-slugs payload.
  // (Audited 2026-06-17; grepped every clientPlaces/clientPlaceBySlug
  // consumer + every place-card component.) Note last_verified_at is NOT
  // dropped — PlaceSheet's FreshnessChip reads it from the slim record.
  //
  // open_status is ALSO dropped: it's a build-time open/closed snapshot that
  // the client loader (places-client.ts `withLiveStatus`) unconditionally
  // RECOMPUTES from the compact `hours` on every read, so the baked value is
  // never read — it only bloated the bundle and churned the diff on every
  // rebuild. The compact `hours` it recomputes from is kept.
  const {
    google_photos: _gp,
    google_photo_attributions: _gpa,
    google_hours: _gh,
    review_snippet: _rs,
    review_author: _ra,
    review_author_uri: _rau,
    review_author_photo_uri: _rap,
    review_google_maps_uri: _rgm,
    google_maps_uri: _pgm,
    source_url: _su,
    license: _lic,
    source_id: _sid,
    confidence: _conf,
    first_seen_at: _fsa,
    hours_source: _hs,
    open_status: _os,
    ...rest
  } = d;
  void _gp; void _gpa; void _gh; void _rs; void _ra;
  void _rau; void _rap; void _rgm; void _pgm;
  void _su; void _lic; void _sid; void _conf; void _fsa; void _hs; void _os;
  return {
    ...rest,
    // /api/want historically matches the canonical RAW category first, then
    // decorates the matched rows. Preserve that distinction so the slim route
    // returns the exact same answer set as the full loader even when Google
    // later corrected a place's display category.
    want_match_category: p.category,
    want_match_subcategories: p.subcategories,
  };
});

writeFileSync(OUT, JSON.stringify(slim));
const bytes = Buffer.byteLength(JSON.stringify(slim));
console.log(`wrote ${OUT} — ${slim.length} places, ${(bytes / 1_000_000).toFixed(2)} MB`);
