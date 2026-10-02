import type { PlaceCardData } from "@/lib/loaders/places";
import { createAbortDeadline } from "@/lib/promise-deadline";

export const PLACE_LOOKUP_TIMEOUT_MS = 15_000;

/** Bound transport and body reads, including transports that ignore abort. */
export async function fetchPlaceSheetLookup(
  slug: string,
  parentSignal: AbortSignal,
  timeoutMs = PLACE_LOOKUP_TIMEOUT_MS,
): Promise<PlaceCardData | null> {
  const deadline = createAbortDeadline(timeoutMs, parentSignal);
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Place lookup was cancelled or timed out", "AbortError"));
    if (deadline.signal.aborted) onAbort();
    else deadline.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const payload = await Promise.race([
      deadline.signal.aborted ? interrupted :
        fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slug)}`, { signal: deadline.signal })
          .then((response) => response.ok ? response.json() : null),
      interrupted,
    ]) as { places?: PlaceCardData[] } | null;
    return Array.isArray(payload?.places)
      ? payload.places.find((place) => place.slug === slug) ?? null
      : null;
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.dispose();
  }
}
