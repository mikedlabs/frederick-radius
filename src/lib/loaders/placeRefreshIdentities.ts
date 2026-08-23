import RAW from "@/data/place-refresh-identities.json" with { type: "json" };
import { isHoursRefreshCategory } from "@/lib/hours-refresh-targets";

export type PlaceRefreshIdentity = {
  slug: string;
  google_place_id: string;
  category: string;
};

type PlaceRefreshIdentityArtifact = {
  identities?: PlaceRefreshIdentity[];
};

/**
 * Small server-safe provider catalog. Unlike places-client.json, this snapshot
 * is not filtered by current business status or season.
 */
export function placeRefreshIdentities(): PlaceRefreshIdentity[] {
  const identities = (RAW as PlaceRefreshIdentityArtifact).identities;
  if (!Array.isArray(identities)) {
    throw new Error(
      "place-refresh-identities.json is malformed; run npm run build:place-refresh-identities.",
    );
  }
  return identities;
}

/** The exact canonical identities covered by the paid hours policy. */
export function hoursRefreshTargetIdentities(): PlaceRefreshIdentity[] {
  return placeRefreshIdentities().filter((identity) =>
    isHoursRefreshCategory(identity.category),
  );
}

/**
 * Legacy rows for excluded categories may remain in Postgres and the
 * committed artifact after the target policy changes. Keep health metrics
 * scoped to the rows the writer is still expected to refresh.
 */
export function hoursRefreshTargetArtifact(
  artifact: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const targetSlugs = new Set(
    hoursRefreshTargetIdentities().map((identity) => identity.slug),
  );
  return Object.fromEntries(
    Object.entries(artifact).filter(
      ([slug]) => slug.startsWith("_") || targetSlugs.has(slug),
    ),
  );
}
