import type {
  GooglePhotoAttribution,
  PlaceEnrichment,
} from "@/lib/integrations/google-places";
import { publishableGooglePhotoNames } from "@/lib/google-photo-policy";
import { isGooglePlaceId } from "@/lib/provenance";

export type PhotoBackfillRow = Partial<PlaceEnrichment> & {
  enriched_at?: string;
  photo_metadata_refreshed_at?: string;
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

/** A row needs a metadata refresh when it has legacy photo resource names but
 * none of those names is paired with a current, individually attributable
 * photo record. Rows without a durable Google Place ID cannot use the cheap
 * Details-by-ID path and stay out of this batch. */
export function needsGooglePhotoMetadata(row: PhotoBackfillRow): boolean {
  const names = row.photo_names ?? [];
  if (names.length === 0 || !isGooglePlaceId(row.google_place_id)) return false;
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
  const attributions: GooglePhotoAttribution[] =
    fresh.photo_attributions ?? [];
  return {
    ...existing,
    photo_names: fresh.photo_names,
    photo_attributions: attributions,
    photo_metadata_refreshed_at: refreshedAt,
  };
}
