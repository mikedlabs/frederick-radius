import { unstable_cache } from "next/cache";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { createSingleFlight } from "@/lib/single-flight";

// A stale provider response may still have an explanatory timestamp for the
// current caller. Keep its data out of errors emitted by cache revalidation.
class UnverifiedSourceResult<T> extends Error {
  readonly #result: T;
  constructor(key: string, result: T) {
    super(`Unable to verify ${key}`);
    this.#result = result;
  }
  get result() { return this.#result; }
}

/** Keep a source's last verified result across callers with different UI deadlines. */
export function createVerifiedSourceReader<T extends { available: boolean }>(
  key: string,
  load: () => Promise<T>,
  fallback: T,
  asOf: (result: T) => string | undefined,
  maxAgeMs: number,
) {
  const singleFlight = createSingleFlight<"read", T>();
  let lastGood: T | undefined;
  // A failed refresh must not overwrite a successfully checked source in the
  // shared data cache. Next retains the previous entry if revalidation throws.
  const cachedRead = unstable_cache(async () => {
    const value = await load();
    if (!isCurrent(value)) throw new UnverifiedSourceResult(key, value);
    return value;
  }, ["county-source-v1", key], { revalidate: 60, tags: ["current-situation"] });

  function isCurrent(value: T | undefined): value is T {
    if (!value?.available) return false;
    const age = Date.now() - Date.parse(asOf(value) ?? "");
    return age >= 0 && age < maxAgeMs;
  }

  return (deadlineMs: number, uncached = false): Promise<T> => {
    if (uncached) return withDeadlineFallback(load(), deadlineMs, fallback);
    const retained = isCurrent(lastGood) ? lastGood : undefined;
    const work = singleFlight("read", async () => {
      try {
        const value = await cachedRead();
        // A refresh may return an older cached response. Prefer the newer
        // successful check while it remains inside this source's original TTL.
        if (isCurrent(lastGood) && (!isCurrent(value) || Date.parse(asOf(lastGood)!) > Date.parse(asOf(value)!))) {
          return lastGood;
        }
        if (isCurrent(value)) lastGood = value;
        return value;
      } catch (error) {
        if (isCurrent(lastGood)) return lastGood;
        return error instanceof UnverifiedSourceResult ? error.result as T : fallback;
      }
    });
    // A cache hit can provide newer evidence immediately. When a refresh is
    // slow, return the still-valid original check without holding the header.
    return withDeadlineFallback(work, retained ? Math.min(deadlineMs, 100) : deadlineMs, retained ?? fallback);
  };
}
