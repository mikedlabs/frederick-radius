import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

function isIndividualGooglePhotoUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const isGenericPlaceLookup = /^\/maps\/place\/?$/.test(url.pathname) &&
      (url.searchParams.has("q") || url.searchParams.has("query_place_id"));
    return url.protocol === "https:" &&
      /(^|\.)google\.com$/.test(url.hostname) &&
      url.pathname.startsWith("/maps/") &&
      !isGenericPlaceLookup;
  } catch {
    return false;
  }
}

/**
 * A legacy photo resource name is not enough to publish an image. Require the
 * exact metadata record returned for that resource plus Google's individual
 * photo source link. Author attribution, when supplied, remains attached to
 * that same record for the full-size view.
 */
export function publishableGooglePhotoAttribution(
  photoName: string,
  attributions: readonly GooglePhotoAttribution[] = [],
): GooglePhotoAttribution | undefined {
  return attributions.find(
    (attribution) =>
      attribution.photo_name === photoName &&
      isIndividualGooglePhotoUrl(attribution.google_maps_uri),
  );
}

export function googlePhotoNameFromProxyUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://frederickradius.app");
    if (url.pathname !== "/api/place-photo") return undefined;
    return url.searchParams.get("name") ?? undefined;
  } catch {
    return undefined;
  }
}

export function publishableGooglePhotoNames(
  photoNames: readonly string[] = [],
  attributions: readonly GooglePhotoAttribution[] = [],
): string[] {
  return photoNames.filter((photoName) =>
    Boolean(publishableGooglePhotoAttribution(photoName, attributions)),
  );
}
