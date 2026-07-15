import { readCachedPosition } from "@/hooks/useGeolocation";
import { roundCoord } from "@/lib/walkTime";

/**
 * Client-side want-answer cache + prefetch.
 *
 * The "I want…" chips answer over the network (/api/want computes open-now
 * live), so the first tap can wait on the round trip (and a cold serverless
 * start). Two cheap client tricks hide most of that:
 *
 *   1. PREFETCH ON PRESS. The chip fires this on pointerdown, which precedes
 *      the click by the whole tap gesture, so the request is already in
 *      flight before the panel even mounts. The panel's own load then finds
 *      the request started, not a fresh one.
 *   2. MEMO. A short in-memory cache dedupes an in-flight request and lets a
 *      re-tap of the same craving resolve instantly. TTL is short so open-now
 *      stays honest (and the panel always shows each place's real closing
 *      time anyway).
 *
 * Pure fetch layer, no React. The panel reads getWantAnswer(); the chip calls
 * prefetchWant() and ignores the result.
 */

/** How long a memoized answer is reused before a fresh fetch. Short: open-now
 *  can shift, and the win we care about is the in-session re-tap + the
 *  pointerdown→mount overlap, not long-term caching. */
const TTL_MS = 45_000;

type Entry = { at: number; promise: Promise<unknown> };
const cache = new Map<string, Entry>();

function buildUrl(cKey: string, facet: string | null): { url: string; key: string } {
  const fix = readCachedPosition();
  // Never put an exact device fix into a URL, CDN key, access log, or error
  // trace. A ~100m snap preserves useful neighborhood ranking while keeping
  // the browser request itself coarse (the server rounds again defensively).
  const approximateFix = fix
    ? { lat: roundCoord(fix.lat), lng: roundCoord(fix.lng) }
    : null;
  const geo = approximateFix
    ? `&lat=${approximateFix.lat}&lng=${approximateFix.lng}`
    : "";
  const url = `/api/want?c=${encodeURIComponent(cKey)}${facet ? `&facet=${encodeURIComponent(facet)}` : ""}${geo}`;
  // Geo rides in the key so a moved position doesn't serve a stale ranking.
  const key = `${cKey}|${facet ?? ""}|${approximateFix ? `${approximateFix.lat},${approximateFix.lng}` : ""}`;
  return { url, key };
}

/**
 * Fetch (or reuse) the want answer for a craving. Returns the parsed JSON, or
 * rejects on a non-OK response so the caller can show its error state. A
 * rejected attempt is evicted so the next tap retries cleanly.
 */
export function getWantAnswer(cKey: string, facet: string | null): Promise<unknown> {
  const { url, key } = buildUrl(cKey, facet);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  // This request is the direct result of a tap and paints the answer panel;
  // keep it ahead of below-the-fold images and speculative page work that may
  // still be settling on /today.
  const promise = fetch(url, { priority: "high" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Warm the cache for a craving without awaiting it. Safe to call on every
 *  pointerdown; a fresh in-flight entry short-circuits duplicates. The no-op
 *  catch keeps a failed prefetch from surfacing as an unhandled rejection —
 *  the real tap re-fetches (the failed entry self-evicts) and shows the error. */
export function prefetchWant(cKey: string, facet: string | null): void {
  getWantAnswer(cKey, facet).catch(() => {});
}
