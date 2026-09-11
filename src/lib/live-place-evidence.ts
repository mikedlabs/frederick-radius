import type { PlaceCardData } from "@/lib/loaders/places";
import { getOpenStatus } from "@/lib/hours";
import { isHoursFresh } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { parseGoogleHours } from "@/lib/googleHours";
import { resolveRefreshedBusinessStatus } from "@/lib/business-status-refresh";
import { activeManualPlaceStatusOverride } from "@/lib/place-status-overrides";

/**
 * A bounded, server-read projection of the newest evidence already stored by
 * the paid hours refresh. It deliberately carries the provider identity so a
 * recycled slug can never inherit another business's hours.
 */
export type LivePlaceEvidence = {
  slug: string;
  placeId: string;
  weekdayHours: string[] | null;
  businessStatus: string | null;
  observedAt: string;
};

/**
 * Merge current database evidence over a shipped place card without weakening
 * any of the catalog's trust rules. Human hours corrections and active manual
 * status decisions remain authoritative. Stale, malformed, mismatched, or
 * implausible provider schedules are ignored rather than partially applied.
 */
export function applyLivePlaceEvidence(
  place: PlaceCardData,
  evidence: LivePlaceEvidence | undefined,
  now: Date = new Date(),
): PlaceCardData {
  if (
    !evidence ||
    evidence.slug !== place.slug ||
    !place.google_place_id ||
    evidence.placeId !== place.google_place_id ||
    !isHoursFresh(evidence.observedAt, now)
  ) {
    return place;
  }

  const manualStatus = activeManualPlaceStatusOverride(place.slug, now);
  const providerStatus = resolveRefreshedBusinessStatus(undefined, {
    business_status: evidence.businessStatus ?? undefined,
    refreshed_at: evidence.observedAt,
  });
  const operationalStatus = manualStatus?.status ?? providerStatus?.status;

  if (
    operationalStatus === "closed_permanently" ||
    operationalStatus === "closed_temporarily"
  ) {
    return {
      ...place,
      is_operational: operationalStatus,
      hours: undefined,
      hours_verified: false,
      google_hours: undefined,
      open_status: { state: "unknown" },
    };
  }

  // Curated corrections intentionally outrank the provider. They exist for
  // cases where a mechanically refreshed schedule is known to be wrong.
  if (place.hours_source === "manual_override") {
    return operationalStatus
      ? { ...place, is_operational: operationalStatus }
      : place;
  }

  const hours = parseGoogleHours(evidence.weekdayHours);
  const mayPublish = Boolean(
    hours && mayPublishVisitabilityHours(place.slug, hours, now),
  );
  if (!hours || !mayPublish) {
    return operationalStatus
      ? { ...place, is_operational: operationalStatus }
      : place;
  }

  return {
    ...place,
    ...(operationalStatus ? { is_operational: operationalStatus } : {}),
    hours,
    hours_verified: true,
    hours_source: "google_places",
    hours_updated_at: evidence.observedAt,
    google_hours: evidence.weekdayHours ?? undefined,
    open_status: getOpenStatus(hours, { verified: true }, now),
  };
}

export function applyLivePlaceEvidenceMap(
  places: readonly PlaceCardData[],
  evidence: ReadonlyMap<string, LivePlaceEvidence>,
  now: Date = new Date(),
): PlaceCardData[] {
  return places.map((place) =>
    applyLivePlaceEvidence(place, evidence.get(place.slug), now),
  );
}
