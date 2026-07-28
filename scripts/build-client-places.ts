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
import { businessInfoCommerceLinks } from "@/lib/loaders/businessInfo";
import { hoursFreshnessEnforced } from "@/lib/hours-freshness";
import { findGooglePlaceIdCollisions } from "@/lib/quality/enrichmentBinding";
import { mergeClientCommerceLinks } from "./lib/client-commerce-links";

const OUT = new URL("../src/data/places-client.json", import.meta.url).pathname;
const HOURS_OUT = new URL("../src/data/places-client-hours.json", import.meta.url).pathname;

const slim = publicPlaces().map((p) => {
  const d = decoratePlace(p) as PlaceCardData & {
    google_photos?: unknown;
    google_photo_attribution?: unknown;
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
    commerce_links?: unknown;
  };
  const commerceLinks = mergeClientCommerceLinks(
    d.commerce_links,
    businessInfoCommerceLinks(d.slug),
  );
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
    google_photo_attribution: _gpaHero,
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
    commerce_links: _cl,
    ...rest
  } = d;
  void _gp; void _gpaHero; void _gpa; void _gh; void _rs; void _ra;
  void _rau; void _rap; void _rgm; void _pgm;
  void _su; void _lic; void _sid; void _conf; void _fsa; void _hs; void _os;
  void _cl;
  return {
    ...rest,
    // The business-info workflow writes through a review PR. Once accepted,
    // its exact direct links join the client artifact here, so map sheets and
    // cards can act on them without importing the server-only source file.
    ...(commerceLinks ? { commerce_links: commerceLinks } : {}),
    // The build only emits a hero after the server-side exact-attribution
    // policy accepts its photo/source pair. Keep that verdict as one byte-ish
    // boolean instead of shipping the full author/profile/report record with
    // every client row. Sheets hydrate the rich attribution only when opened.
    google_photo_policy_passed: d.google_photo_url ? true : undefined,
    // Browser code cannot safely read the private HOURS_FRESHNESS_ENFORCED
    // env var. Stamp the build policy into each slim row; strict builds can
    // continue aging schedules out at runtime, staged builds keep legacy
    // verified schedules available until the refresh snapshot is populated.
    hours_policy_strict: hoursFreshnessEnforced(),
    // /api/want historically matches the canonical RAW category first, then
    // decorates the matched rows. Preserve that distinction so the slim route
    // returns the exact same answer set as the full loader even when Google
    // later corrected a place's display category.
    want_match_category: p.category,
    want_match_subcategories: p.subcategories,
  };
});

const identityCollisions = findGooglePlaceIdCollisions(slim);
if (identityCollisions.length > 0) {
  const detail = identityCollisions
    .map(
      ({ googlePlaceId, slugs }) =>
        `${googlePlaceId}: ${slugs.join(", ")}`,
    )
    .join("\n");
  throw new Error(
    `Refusing to publish a client catalog with duplicate Google Place IDs:\n${detail}`,
  );
}

const clientJson = JSON.stringify(slim);
writeFileSync(OUT, clientJson);
const bytes = Buffer.byteLength(clientJson);
console.log(`wrote ${OUT} — ${slim.length} places, ${(bytes / 1_000_000).toFixed(2)} MB`);

// AppMap's time scrubber needs only schedules. Keep those records in a
// separate generated artifact so the first scrub does not download the full
// browse catalog (including every hero-photo URL) just to dim closed pins.
// Rows without a publishable verified schedule are intentionally omitted:
// the scrubber already treats a missing schedule as unknown and leaves that
// pin visible.
const hoursSlim = slim.flatMap((place) =>
  place.hours && place.hours_verified
    ? [{
        slug: place.slug,
        hours: place.hours,
        hours_verified: true as const,
        hours_updated_at: place.hours_updated_at,
        hours_policy_strict: place.hours_policy_strict,
      }]
    : [],
);
const hoursJson = JSON.stringify(hoursSlim);
writeFileSync(HOURS_OUT, hoursJson);
const hoursBytes = Buffer.byteLength(hoursJson);
console.log(
  `wrote ${HOURS_OUT} — ${hoursSlim.length} verified schedules, ${(hoursBytes / 1_000_000).toFixed(2)} MB`,
);
