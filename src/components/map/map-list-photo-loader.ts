type MapListPhotoResponse = {
  places?: Array<{
    slug?: unknown;
    google_photo_url?: unknown;
  }>;
};

type FetchResult = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type MapListPhotoFetcher = (input: string) => Promise<FetchResult>;

type PendingPhoto = {
  promise: Promise<string | null>;
  resolve: (photoUrl: string | null) => void;
};

export type MapListPhotoLoader = {
  /** Undefined means this slug has not been checked; null is a checked fallback. */
  peek: (slug: string) => string | null | undefined;
  load: (slug: string) => Promise<string | null>;
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
  const cache = new Map<string, string | null>();
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

  function load(slug: string): Promise<string | null> {
    if (cache.has(slug)) return Promise.resolve(cache.get(slug) ?? null);

    const existing = pending.get(slug);
    if (existing) return existing.promise;

    let resolve!: (photoUrl: string | null) => void;
    const promise = new Promise<string | null>((done) => {
      resolve = done;
    });
    pending.set(slug, { promise, resolve });
    queued.add(slug);
    schedule();
    return promise;
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
      const photos = new Map<string, string>();
      for (const place of body.places ?? []) {
        if (
          typeof place.slug === "string" &&
          typeof place.google_photo_url === "string" &&
          place.google_photo_url.length > 0
        ) {
          photos.set(place.slug, place.google_photo_url);
        }
      }

      for (const slug of slugs) {
        const photoUrl = photos.get(slug) ?? null;
        cache.set(slug, photoUrl);
        pending.get(slug)?.resolve(photoUrl);
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
    peek: (slug) => (cache.has(slug) ? cache.get(slug) ?? null : undefined),
    load,
    flush,
  };
}

export const mapListPhotoLoader = createMapListPhotoLoader();
