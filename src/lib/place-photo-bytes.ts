/** Same-origin transport for a visible Google photo. No settled image cache:
 * Places responses are no-store. Only concurrent requests share bytes, and
 * each mounted consumer owns and revokes its temporary display URL. */
import { createAbortDeadline } from "@/lib/promise-deadline";

export const GOOGLE_PHOTO_BYTES_ROOT_MARGIN = "48px 0px";
export const GOOGLE_PHOTO_BYTES_DEADLINE_MS = 10_000;
// Match the existing proxy response ceiling; these are display bytes only.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_READS = 4_096;

export type PlacePhotoBytes =
  | { kind: "photo"; blob: Blob }
  | { kind: "fallback"; reason: string };

type PhotoFetcher = (src: string, init: RequestInit) => Promise<Response>;

export function createPlacePhotoBytesLoader(fetcher: PhotoFetcher = (src, init) => fetch(src, init)) {
  const pending = new Map<string, Promise<PlacePhotoBytes>>();
  return function load(src: string): Promise<PlacePhotoBytes> {
    // The caller's source plan already binds photo identity and attribution.
    // Defense in depth: this transport must never fetch an external provider.
    let url: URL;
    try { url = new URL(src, "https://frederickradius.app"); }
    catch { return Promise.resolve({ kind: "fallback", reason: "invalid-source" }); }
    if (!src.startsWith("/api/place-photo?") || url.origin !== "https://frederickradius.app" ||
      url.pathname !== "/api/place-photo" || url.hash ||
      url.searchParams.getAll("name").length !== 1 ||
      !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(url.searchParams.get("name") ?? "") ||
      url.searchParams.get("fallback") !== "signal") {
      return Promise.resolve({ kind: "fallback", reason: "invalid-source" });
    }
    const existing = pending.get(src);
    if (existing) return existing;
    const deadline = createAbortDeadline(GOOGLE_PHOTO_BYTES_DEADLINE_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let cancelled = false;
    const cancelBody = () => {
      if (!reader || cancelled) return;
      cancelled = true;
      void reader.cancel().catch(() => {});
    };
    let onAbort!: () => void;
    const stopped = new Promise<PlacePhotoBytes>((resolve) => {
      onAbort = () => {
        cancelBody();
        resolve({ kind: "fallback", reason: "fetch-timeout" });
      };
      deadline.signal.addEventListener("abort", onAbort, { once: true });
    });
    const work = (async (): Promise<PlacePhotoBytes> => {
      try {
        const response = await fetcher(src, {
          cache: "no-store", credentials: "same-origin", signal: deadline.signal,
        });
        // A late response must not allocate bytes after this shared request's
        // deadline, even if a custom fetcher ignored its AbortSignal.
        if (deadline.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          return { kind: "fallback", reason: "fetch-timeout" };
        }
        const reason = response.headers.get("x-photo-fallback")?.trim();
        const contentType = response.headers.get("content-type");
        if (reason || !response.ok || !contentType?.startsWith("image/")) {
          void response.body?.cancel().catch(() => {});
          return { kind: "fallback", reason: reason || (!response.ok ? `http-${response.status}` : "not-image") };
        }
        // Own the reader so a stalled body can be cancelled as well as raced.
        // Merely racing response.blob() would leave its locked stream alive.
        reader = response.body?.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let length = 0;
        let reads = 0;
        while (reader) {
          const { done, value } = await reader.read();
          if (deadline.signal.aborted) return { kind: "fallback", reason: "fetch-timeout" };
          if (done) break;
          if (++reads > MAX_PHOTO_READS || value.byteLength > MAX_PHOTO_BYTES - length) {
            cancelBody();
            return { kind: "fallback", reason: "body-too-large" };
          }
          length += value.byteLength;
          chunks.push(new Uint8Array(value));
        }
        return length > 0
          ? { kind: "photo", blob: new Blob(chunks, { type: contentType }) }
          : { kind: "fallback", reason: "body-empty" };
      } catch {
        return { kind: "fallback", reason: deadline.signal.aborted ? "fetch-timeout" : "fetch-error" };
      } finally {
        reader?.releaseLock();
      }
    })();
    const request: Promise<PlacePhotoBytes> = Promise.race([work, stopped]).finally(() => {
      deadline.signal.removeEventListener("abort", onAbort);
      deadline.dispose();
      // No success, failure or timed-out entry survives completion. A late old
      // request cannot evict a newer request for the same source.
      if (pending.get(src) === request) pending.delete(src);
    });
    pending.set(src, request);
    return request;
  };
}

export const loadPlacePhotoBytes = createPlacePhotoBytesLoader();
