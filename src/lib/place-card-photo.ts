import type { PlaceCardData } from "@/lib/loaders/places";
import { getLandmarkPhoto, wikimediaUrl, type WikimediaPhoto } from "@/lib/integrations/wikimedia";
import { googlePhotoNameFromProxyUrl, publishableGooglePhotoAttribution } from "@/lib/google-photo-policy";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

export type PlaceCardPhotoSource =
  | { kind: "curated"; src: string; alt: string; photo: WikimediaPhoto }
  | { kind: "google"; src: string; alt: string; attribution: GooglePhotoAttribution }
  | { kind: "owned"; src: string; alt: string };
export type PlaceCardPhotoPlan = { key: string; sources: readonly PlaceCardPhotoSource[] };
export type PlaceCardPhotoState = { planKey: string; failedSources: readonly string[]; loadedSrc: string | null };
export type PlaceCardPhotoResult = "loaded" | "failed";

/** Request a detectable failure instead of the proxy's branded placeholder. */
export function placePhotoFailureSignalSrc(src: string): string {
  if (!src.startsWith("/api/place-photo")) return src;
  const url = new URL(src, "https://frederickradius.local");
  url.searchParams.set("fallback", "signal");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function isPlacePhotoFailureSignal(image: {
  naturalWidth: number;
  naturalHeight: number;
}): boolean {
  return image.naturalWidth <= 1 || image.naturalHeight <= 1;
}

function sourceIdentity(source: PlaceCardPhotoSource): string {
  return `${source.kind}:${source.kind === "google" ? source.attribution.photo_name : source.src}`;
}

type PlacePhotoInput = Pick<PlaceCardData, "slug" | "google_photo_url" | "google_photo_attribution"> &
  Partial<Pick<PlaceCardData, "google_photos" | "google_photo_attributions">>;

function suppliedPhotoSource(rawSrc: string | undefined, width: number,
  attributions: readonly GooglePhotoAttribution[]): PlaceCardPhotoSource | null {
  if (rawSrc?.startsWith("/api/place-photo?")) {
    const name = googlePhotoNameFromProxyUrl(rawSrc);
    const attribution = name && publishableGooglePhotoAttribution(name, attributions);
    if (attribution) {
      const url = new URL(proxyPhotoAtWidth(rawSrc, width), "https://frederickradius.local");
      url.searchParams.set("fallback", "signal");
      return { kind: "google", src: `${url.pathname}${url.search}`, alt: "", attribution };
    }
  } else if (rawSrc?.startsWith("/images/")) {
    // Compatibility for existing first-party fixtures; the registry below
    // supplies actual owned place imagery without writing Google data fields.
    return { kind: "owned", src: rawSrc, alt: "" };
  }
  return null;
}

/** Exact landmark imagery only. Never substitute a town or category photo.
 * Today may opt into free-first discovery; other callers retain their order. */
export function placeCardPhotoPlan(
  place: PlacePhotoInput,
  width: number,
  { preferNonGoogle = false }: { preferNonGoogle?: boolean } = {},
): PlaceCardPhotoPlan {
  const curated = getLandmarkPhoto(place.slug);
  const owned = getOwnedPlacePhoto(place.slug);
  const curatedSource: PlaceCardPhotoSource | null = curated
    ? { kind: "curated", src: wikimediaUrl(curated.file, width * 2), alt: curated.alt, photo: curated }
    : null;
  const suppliedSource = suppliedPhotoSource(place.google_photo_url, width,
    [place.google_photo_attribution, ...(place.google_photo_attributions ?? [])]
      .filter((item): item is GooglePhotoAttribution => Boolean(item)));
  // Preferred curated files were chosen because the Google hero was unsuitable.
  // If they fail, do not bring that known unsuitable image back.
  const fallbacks = curated?.preferCurated && curatedSource
    ? [curatedSource]
    : (preferNonGoogle && suppliedSource?.kind === "google"
      ? [curatedSource, suppliedSource] : [suppliedSource, curatedSource])
      .filter((source): source is PlaceCardPhotoSource => source !== null);
  const sources = [owned, ...fallbacks].filter((source): source is PlaceCardPhotoSource => source !== null)
    .filter((source, index, all) => all.findIndex((item) => sourceIdentity(item) === sourceIdentity(source)) === index);
  return { key: JSON.stringify([place.slug, sources.map((source) => [source.kind, source.src])]), sources };
}

/** Hero first, then individually publishable photos. Preserve source identity
 * through the detail rail and lightbox rather than inferring credit from URL. */
export function placePhotoGallerySources(place: PlacePhotoInput, width: number): PlaceCardPhotoSource[] {
  // Fallbacks are alternatives for the hero, not extra gallery requests.
  const hero = placeCardPhotoPlan(place, width).sources.slice(0, 1);
  const attributions = [place.google_photo_attribution, ...(place.google_photo_attributions ?? [])]
    .filter((item): item is GooglePhotoAttribution => Boolean(item));
  const unsuitableHero = getLandmarkPhoto(place.slug)?.preferCurated ? place.google_photo_url : undefined;
  const unsuitableName = unsuitableHero && googlePhotoNameFromProxyUrl(unsuitableHero);
  const extra = (place.google_photos ?? []).filter((url) => url !== unsuitableHero &&
    (!unsuitableName || googlePhotoNameFromProxyUrl(url) !== unsuitableName))
    .map((url) => suppliedPhotoSource(url, width, attributions))
    .filter((source): source is PlaceCardPhotoSource => source !== null);
  return [...hero, ...extra].filter((source, index, all) => all.findIndex((item) => sourceIdentity(item) === sourceIdentity(source)) === index);
}

export function selectedPlaceCardPhoto(plan: PlaceCardPhotoPlan, state: PlaceCardPhotoState | null): PlaceCardPhotoSource | null {
  const failures = state?.planKey === plan.key ? state.failedSources : [];
  return plan.sources.find((source) => !failures.includes(source.src)) ?? null;
}

/** Ignore late events from an old image and never retry an exhausted source. */
export function recordPlaceCardPhotoResult(
  plan: PlaceCardPhotoPlan,
  state: PlaceCardPhotoState | null,
  src: string,
  result: PlaceCardPhotoResult,
): PlaceCardPhotoState {
  const current = state?.planKey === plan.key ? state : { planKey: plan.key, failedSources: [], loadedSrc: null };
  if (selectedPlaceCardPhoto(plan, current)?.src !== src) return current;
  return result === "loaded"
    ? { ...current, loadedSrc: src }
    : { ...current, failedSources: [...current.failedSources, src], loadedSrc: null };
}
