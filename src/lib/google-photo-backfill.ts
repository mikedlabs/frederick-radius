import type {
  GooglePhotoAttribution,
  PlaceEnrichment,
} from "@/lib/integrations/google-places";
import { publishableGooglePhotoNames } from "@/lib/google-photo-policy";
import { isGooglePlaceId } from "@/lib/provenance";

export type PhotoBackfillRow = Partial<PlaceEnrichment> & {
  enriched_at?: string;
  photo_metadata_refreshed_at?: string;
  photo_identity_verified_at?: string;
};

function isCanonicalGooglePlaceId(
  id: string | null | undefined,
): id is string {
  return (
    isGooglePlaceId(id) &&
    id.length >= 20 &&
    /^[A-Za-z0-9_-]+$/.test(id)
  );
}

/**
 * Repair an enrichment row's missing/legacy identifier from the canonical
 * public place record before deciding whether it is eligible for the
 * attribution backfill. This is a deterministic join, not a guessed ID:
 * only a validated Google Place ID is accepted and an already-valid
 * enrichment ID always wins.
 */
export function withCanonicalGooglePlaceId(
  row: PhotoBackfillRow,
  canonicalGooglePlaceId: string | undefined,
): PhotoBackfillRow {
  if (isCanonicalGooglePlaceId(row.google_place_id)) return row;
  if (!isCanonicalGooglePlaceId(canonicalGooglePlaceId)) return row;
  return {
    ...row,
    google_place_id: canonicalGooglePlaceId,
  };
}

/** A row needs a metadata refresh whenever it has a durable Google Place ID
 * but no current, individually attributable photo record. This includes both
 * legacy rows whose photo names predate attribution metadata and verified
 * listings that have never fetched photos at all. Rows without a durable
 * Google Place ID cannot use the cheap Details-by-ID path and stay out of this
 * batch. */
export function needsGooglePhotoMetadata(row: PhotoBackfillRow): boolean {
  const names = row.photo_names ?? [];
  if (!isGooglePlaceId(row.google_place_id)) return false;
  return publishableGooglePhotoNames(
    names,
    row.photo_attributions ?? [],
  ).length === 0;
}

/** Merge only photo-scoped fields from a cheap `fields=photos` response.
 * That response intentionally omits hours, ratings, status, and descriptions;
 * replacing the whole enrichment row would silently erase those fields. */
export function mergeGooglePhotoMetadata(
  existing: PhotoBackfillRow,
  fresh: Pick<PlaceEnrichment, "photo_names" | "photo_attributions">,
  refreshedAt: string,
): PhotoBackfillRow {
  // One hero plus two detail-gallery alternates is enough to make every
  // listing visual. Keeping all ten Places photos and their long attribution
  // records inflated the server dataset by ~15 MB without helping card UI.
  const names = publishableGooglePhotoNames(
    fresh.photo_names ?? [],
    fresh.photo_attributions ?? [],
  ).slice(0, 3);
  const attributions: GooglePhotoAttribution[] = (
    fresh.photo_attributions ?? []
  ).filter((attribution) => names.includes(attribution.photo_name));
  return {
    ...existing,
    photo_names: names,
    photo_attributions: attributions,
    photo_metadata_refreshed_at: refreshedAt,
  };
}

/**
 * Store the small identity bundle required to bind a newly resolved photo to
 * the correct canonical place. resolveAndEnrich has already verified the
 * returned name and coordinate against the Radius listing; keeping those
 * fields lets the loader repeat that guard when it decorates the catalog.
 *
 * Do not merge the entire response. This is a photo repair, not an implicit
 * hours, rating, contact, or description refresh.
 */
export function mergeResolvedGooglePhotoMetadata(
  existing: PhotoBackfillRow,
  fresh: Pick<
    PlaceEnrichment,
    | "google_place_id"
    | "business_status"
    | "display_name"
    | "formatted_address"
    | "lat"
    | "lng"
    | "google_maps_uri"
    | "photo_names"
    | "photo_attributions"
  >,
  refreshedAt: string,
): PhotoBackfillRow {
  return {
    ...mergeGooglePhotoMetadata(existing, fresh, refreshedAt),
    google_place_id: fresh.google_place_id,
    business_status: fresh.business_status,
    display_name: fresh.display_name,
    formatted_address: fresh.formatted_address,
    lat: fresh.lat,
    lng: fresh.lng,
    google_maps_uri: fresh.google_maps_uri,
    photo_identity_verified_at: refreshedAt,
  };
}
