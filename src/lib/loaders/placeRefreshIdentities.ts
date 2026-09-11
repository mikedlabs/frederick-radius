import RAW from "@/data/place-refresh-identities.json" with { type: "json" };

export type PlaceRefreshIdentity = {
  slug: string;
  google_place_id: string;
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
