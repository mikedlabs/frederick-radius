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
 *
 * List hydration may omit `photo_name` because the proxy URL already carries
 * that identity. `bindUnnamedToUrl` accepts that slim credit for the name
 * taken from the URL and fills it on the returned record. A supplied name
 * that does not match still fails, so a gallery extra cannot inherit the
 * hero credit.
 */
export function publishableGooglePhotoAttribution(
  photoName: string,
  attributions: readonly GooglePhotoAttribution[] = [],
  options?: { bindUnnamedToUrl?: boolean },
): GooglePhotoAttribution | undefined {
  const match = attributions.find((attribution) => {
    const named = attribution.photo_name === photoName;
    const unnamed = options?.bindUnnamedToUrl && !attribution.photo_name;
    return (named || unnamed) && isIndividualGooglePhotoUrl(attribution.google_maps_uri);
  });
  if (!match) return undefined;
  return match.photo_name ? match : { ...match, photo_name: photoName };
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

/**
 * Paid Google Places imagery belongs behind a deliberate detail action, not
 * in live search or collapsed browse lists. Publisher, owner, and
 * Radius-owned images remain eligible for those fast discovery surfaces.
 */
export function isPaidGooglePhotoUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, "https://frederickradius.app");
    return (
      url.pathname === "/api/place-photo" ||
      /(^|\.)places\.googleapis\.com$/i.test(url.hostname) ||
      /(^|\.)googleusercontent\.com$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Return the first image candidate that cannot fan out to paid Google media. */
export function browseSafePhotoUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      Boolean(candidate?.trim()) && !isPaidGooglePhotoUrl(candidate),
  );
}
