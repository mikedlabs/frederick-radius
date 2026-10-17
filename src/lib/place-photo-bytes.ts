/**
 * Same-origin Google photo bytes for list cards.
 *
 * `<img src="/api/place-photo">` cannot read `x-photo-fallback`, and a second
 * request after `fetch()` would spend another daily-cap unit because successful
 * photo responses are `Cache-Control: private, no-store`. Fetch once, trust the
 * header, and reuse the object URL for the visible card.
 */

export const GOOGLE_PHOTO_BYTES_ROOT_MARGIN = "48px 0px";

export type PlacePhotoBytes =
  | { kind: "photo"; objectUrl: string }
  | { kind: "fallback"; reason: string };

const cache = new Map<string, PlacePhotoBytes | Promise<PlacePhotoBytes>>();

export function placePhotoFallbackReason(headers: Headers): string | null {
  const reason = headers.get("x-photo-fallback")?.trim();
  return reason ? reason : null;
}

export function resetPlacePhotoBytesCache(): void {
  cache.clear();
}

export function peekPlacePhotoBytes(src: string): PlacePhotoBytes | undefined {
  const entry = cache.get(src);
  if (!entry || entry instanceof Promise) return undefined;
  return entry;
}

export async function loadPlacePhotoBytes(
  src: string,
  fetcher: typeof fetch = fetch,
): Promise<PlacePhotoBytes> {
  const existing = cache.get(src);
  if (existing instanceof Promise) return existing;
  if (existing) return existing;

  const request = (async (): Promise<PlacePhotoBytes> => {
    try {
      const response = await fetcher(src);
      const reason = placePhotoFallbackReason(response.headers);
      if (reason) {
        const fallback = { kind: "fallback" as const, reason };
        cache.set(src, fallback);
        return fallback;
      }
      if (!response.ok) {
        cache.delete(src);
        return { kind: "fallback", reason: `http-${response.status}` };
      }
      const blob = await response.blob();
      if (blob.size === 0) {
        cache.delete(src);
        return { kind: "fallback", reason: "body-empty" };
      }
      const photo = { kind: "photo" as const, objectUrl: URL.createObjectURL(blob) };
      cache.set(src, photo);
      return photo;
    } catch {
      cache.delete(src);
      return { kind: "fallback", reason: "fetch-error" };
    }
  })();

  cache.set(src, request);
  return request;
}
