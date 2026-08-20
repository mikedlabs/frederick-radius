import "server-only";

import DATA_RELEASE from "@/data/data-release.json";
import CLIENT_PLACES from "@/data/places-client.json";
import {
  decisionCopyCounts,
  hasActionableContact,
  hasPublishedFreshHours,
  hasUsefulDecisionCopy,
  hasUsefulPhoto,
  type CoveragePlace,
} from "@/lib/quality/coverage";

export const PUBLIC_DATA_SNAPSHOT_SCHEMA_VERSION = 1;

export type AvailablePublicDataCount = {
  status: "available";
  value: number;
  asOf: string;
};

export type UnavailablePublicDataCount = {
  status: "unavailable";
  value: null;
  asOf: null;
  reason: "runtime_only_not_promoted";
};

type PublicPlaceInput = CoveragePlace & {
  is_operational?: string;
  geom?: { lat?: number; lng?: number };
};

type DataReleaseInput = {
  data_version: string;
  streams: Record<string, { promoted_at: string }>;
};

export type PublicDataSnapshot = {
  schemaVersion: typeof PUBLIC_DATA_SNAPSHOT_SCHEMA_VERSION;
  dataVersion: string;
  lastSuccessfulDataPromotion: string;
  counts: {
    activePublicPlaces: AvailablePublicDataCount;
    mappedPlaces: AvailablePublicDataCount;
    placesWithCurrentHours: AvailablePublicDataCount;
    placesWithDecisionCopy: AvailablePublicDataCount;
    placesWithPhoto: AvailablePublicDataCount;
    placesWithAction: AvailablePublicDataCount;
    upcomingCanonicalEvents: UnavailablePublicDataCount;
    decisionReadyEvents: UnavailablePublicDataCount;
    currentSources: UnavailablePublicDataCount;
    degradedSources: UnavailablePublicDataCount;
  };
};

function validIso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function latestPromotion(release: DataReleaseInput): string {
  const promotions = Object.values(release.streams)
    .map((stream) => stream.promoted_at)
    .filter(validIso)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  if (!promotions[0]) {
    throw new Error("promoted data release has no valid promotion timestamp");
  }
  return promotions[0];
}

function available(value: number, asOf: string): AvailablePublicDataCount {
  return { status: "available", value, asOf };
}

function unavailable(): UnavailablePublicDataCount {
  return {
    status: "unavailable",
    value: null,
    asOf: null,
    reason: "runtime_only_not_promoted",
  };
}

function isActivePublicPlace(place: PublicPlaceInput): boolean {
  return place.is_operational !== "closed_permanently" &&
    place.is_operational !== "closed_temporarily";
}

function isMapped(place: PublicPlaceInput): boolean {
  return Number.isFinite(place.geom?.lat) && Number.isFinite(place.geom?.lng);
}

/**
 * Build the public count contract from promoted inputs.
 *
 * Counts that are properties of the DATA are evaluated at the place stream's
 * promotion time, so the same data version always returns the same answer.
 * Hours coverage is the exception and is evaluated at request time: it is a
 * property of the data's age rather than its content, so a promotion-anchored
 * value stops being true the moment it is written. See the comment at the
 * count itself. Event inventory and source health still depend on runtime
 * systems; those values are explicitly unavailable until their canonical read
 * models are promoted as artifacts too.
 */
export function buildPublicDataSnapshot(
  release: DataReleaseInput,
  places: readonly PublicPlaceInput[],
  now: Date = new Date(),
): PublicDataSnapshot {
  if (!/^sha256:[0-9a-f]{64}$/.test(release.data_version)) {
    throw new Error("promoted data release has an invalid data version");
  }
  const placePromotion = release.streams.places?.promoted_at;
  if (!placePromotion || !validIso(placePromotion)) {
    throw new Error("promoted data release has no valid places timestamp");
  }

  const activePlaces = places.filter(isActivePublicPlace);
  const copyCounts = decisionCopyCounts(activePlaces);

  return {
    schemaVersion: PUBLIC_DATA_SNAPSHOT_SCHEMA_VERSION,
    dataVersion: release.data_version,
    lastSuccessfulDataPromotion: latestPromotion(release),
    counts: {
      activePublicPlaces: available(activePlaces.length, placePromotion),
      mappedPlaces: available(activePlaces.filter(isMapped).length, placePromotion),
      // Hours coverage is the ONE count here that is not a property of the
      // promoted data — it is a property of the data's AGE, and it decays to
      // zero on a 7-day timer whether or not anything is promoted. Anchoring
      // it to promotion time froze it at its best-ever value and published
      // that number indefinitely: /trust claimed "713 of 1,569 places (45%)"
      // while the live figure, recomputed from the same rows, was 0. On the
      // page whose entire job is to be checkable, a number that cannot go
      // down is worse than no number. Evaluate it at request time and stamp
      // it with that time, so the reader sees what is true when they look.
      // Every other count below is genuinely immutable per data version and
      // stays anchored to the promotion.
      placesWithCurrentHours: available(
        activePlaces.filter((place) => hasPublishedFreshHours(place, now))
          .length,
        now.toISOString(),
      ),
      placesWithDecisionCopy: available(
        activePlaces.filter((place) =>
          hasUsefulDecisionCopy(place, copyCounts),
        ).length,
        placePromotion,
      ),
      placesWithPhoto: available(
        activePlaces.filter(hasUsefulPhoto).length,
        placePromotion,
      ),
      placesWithAction: available(
        activePlaces.filter(hasActionableContact).length,
        placePromotion,
      ),
      upcomingCanonicalEvents: unavailable(),
      decisionReadyEvents: unavailable(),
      currentSources: unavailable(),
      degradedSources: unavailable(),
    },
  };
}

export function publicDataSnapshot(): PublicDataSnapshot {
  return buildPublicDataSnapshot(
    DATA_RELEASE as DataReleaseInput,
    CLIENT_PLACES as PublicPlaceInput[],
  );
}
