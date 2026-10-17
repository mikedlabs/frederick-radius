import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

type MapListPhotoResponse = {
  places?: Array<{
    slug?: unknown;
    google_photo_url?: unknown;
    google_photo_attribution?: unknown;
  }>;
};

type FetchResult = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type MapListPhotoFetcher = (input: string) => Promise<FetchResult>;

/** Keep the exact individual-photo credit attached through lazy hydration. */
export type PlacePhotoData = {
  google_photo_url: string;
  google_photo_attribution?: GooglePhotoAttribution;
};

type PendingPhoto = {
  promise: Promise<PlacePhotoData | null>;
  urlPromise: Promise<string | null>;
  resolve: (photo: PlacePhotoData | null) => void;
};

function photoAttribution(value: unknown): GooglePhotoAttribution | undefined {
  if (!value || typeof value !== "object") return undefined;
  const credit = value as Record<string, unknown>;
  if (typeof credit.photo_name !== "string" || !Array.isArray(credit.authors)) return undefined;
  if (credit.google_maps_uri !== undefined && typeof credit.google_maps_uri !== "string") return undefined;
  if (credit.flag_content_uri !== undefined && typeof credit.flag_content_uri !== "string") return undefined;
  for (const author of credit.authors) {
    if (!author || typeof author !== "object") return undefined;
    for (const field of ["display_name", "uri", "photo_uri"]) {
      if (author[field] !== undefined && typeof author[field] !== "string") return undefined;
    }
  }
  // Eligibility is still decided by placeCardPhotoPlan, including exact photo
  // identity and its individual Google Maps source URL. Never infer a credit.
  return value as GooglePhotoAttribution;
}

export type MapListPhotoLoader = {
  /** Undefined means this slug has not been checked; null is a checked fallback. */
  peek: (slug: string) => string | null | undefined;
  load: (slug: string) => Promise<string | null>;
  peekData: (slug: string) => PlacePhotoData | null | undefined;
  loadData: (slug: string) => Promise<PlacePhotoData | null>;
  /** Exposed so the batching contract can be tested without relying on timers. */
  flush: () => Promise<void>;
};

/**
 * Batch the map list's on-demand photo lookups.
 *
 * The main map intentionally ships pin fields only. Each row asks for its photo
 * only when IntersectionObserver says it is near the scroll viewport. Requests
 * arriving in the same short window share one by-slugs call, and both positive
 * and honest no-photo results are cached for the life of the client module.
 */
export function createMapListPhotoLoader({
  fetcher = (input) => fetch(input),
  batchDelayMs = 12,
  maxBatchSize = 32,
}: {
  fetcher?: MapListPhotoFetcher;
  batchDelayMs?: number;
  maxBatchSize?: number;
} = {}): MapListPhotoLoader {
  const cache = new Map<string, PlacePhotoData | null>();
  const pending = new Map<string, PendingPhoto>();
  const queued = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer !== null || queued.size === 0) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, batchDelayMs);
  }

  function enqueue(slug: string): PendingPhoto {
    const existing = pending.get(slug);
    if (existing) return existing;

    let resolve!: (photo: PlacePhotoData | null) => void;
    const promise = new Promise<PlacePhotoData | null>((done) => {
      resolve = done;
    });
    const request = { promise, urlPromise: promise.then((photo) => photo?.google_photo_url ?? null), resolve };
    pending.set(slug, request);
    queued.add(slug);
    schedule();
    return request;
  }

  function loadData(slug: string): Promise<PlacePhotoData | null> {
    if (cache.has(slug)) return Promise.resolve(cache.get(slug) ?? null);
    return enqueue(slug).promise;
  }

  function load(slug: string): Promise<string | null> {
    if (cache.has(slug)) return Promise.resolve(cache.get(slug)?.google_photo_url ?? null);
    return enqueue(slug).urlPromise;
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    const slugs = Array.from(queued).slice(0, Math.max(1, maxBatchSize));
    if (slugs.length === 0) return;
    for (const slug of slugs) queued.delete(slug);

    try {
      const query = new URLSearchParams({ slugs: slugs.join(",") });
      const response = await fetcher(`/api/places/by-slugs?${query.toString()}`);
      if (!response.ok) throw new Error("Map list photo hydration failed");

      const body = (await response.json()) as MapListPhotoResponse;
      if (!Array.isArray(body.places)) throw new Error("Invalid place photo response");
      const photos = new Map<string, PlacePhotoData>();
      for (const place of body.places) {
        if (
          typeof place.slug === "string" &&
          typeof place.google_photo_url === "string" &&
          place.google_photo_url.length > 0
        ) {
          photos.set(place.slug, {
            google_photo_url: place.google_photo_url,
            google_photo_attribution: photoAttribution(place.google_photo_attribution),
          });
        }
      }

      for (const slug of slugs) {
        const photo = photos.get(slug) ?? null;
        cache.set(slug, photo);
        pending.get(slug)?.resolve(photo);
        pending.delete(slug);
      }
    } catch {
      // A network failure is not an authoritative "no photo" result. Resolve
      // this render to its category fallback, but leave the slug uncached so a
      // later list visit can try again.
      for (const slug of slugs) {
        pending.get(slug)?.resolve(null);
        pending.delete(slug);
      }
    } finally {
      if (queued.size > 0) schedule();
    }
  }

  return {
    peek: (slug) => (cache.has(slug) ? cache.get(slug)?.google_photo_url ?? null : undefined),
    load,
    peekData: (slug) => (cache.has(slug) ? cache.get(slug) ?? null : undefined),
    loadData,
    flush,
  };
}

export const mapListPhotoLoader = createMapListPhotoLoader();
