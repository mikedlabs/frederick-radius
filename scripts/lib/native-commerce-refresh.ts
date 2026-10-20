import { isIP } from "node:net";
import { classifyOfficialCommerceLinks, extractPageAnchors, type ExtractedBusinessCommerceLink, type PageAnchor } from "./official-commerce-links";
import {
  FOOD_DRINK_CATEGORIES, isEligibleOfficialBusinessWebsite, mergeCommerceRefresh,
  mergeDistinctCommerceLinks, filterCommerceLinksForPlace, sanitizeStoredCommerceLinks, selectCommerceDiscoveryPages,
  type CommerceRefreshRecord,
} from "./official-commerce-refresh";

export const NATIVE_COMMERCE_LIMIT = 20;
export const NATIVE_COMMERCE_TIMEOUT_MS = 20_000;
export const NATIVE_COMMERCE_MAX_BYTES = 512 * 1024;
export const NATIVE_COMMERCE_REFRESH_DAYS = 30;
export type NativeCommercePlace = { slug: string; name: string; category: string; website?: string; postal_code?: string };
export type NativeCommerceOptions = { limit: number; followPages: 0 | 1; plan: boolean };
export type NativeCommercePage = { url: string; links: PageAnchor[]; bytes: number };
export type NativeCommerceSourceResult = {
  slug: string; ok: boolean; pages_read: number; links: number; reason: string | null;
  safe_hold?: "prior_destinations_not_reobserved";
  missing_prior_links?: Pick<ExtractedBusinessCommerceLink, "type" | "url">[];
  /** Source-found candidate only, kept in private diagnostics, never applied on a hold. */
  candidate?: { name: string; commerce_links: ExtractedBusinessCommerceLink[]; commerce_source: { url: string; checkedAt: string } };
};

/** A published primary-site candidate is not a general crawler destination. */
export function nativeCommerceUrl(value: string, officialUrl?: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !hostname.includes(".") || isIP(hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)) return null;
    if (officialUrl && url.hostname !== new URL(officialUrl).hostname) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function parseNativeCommerceOptions(args: readonly string[]): NativeCommerceOptions {
  const out: NativeCommerceOptions = { limit: 20, followPages: 1, plan: false };
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split("=")[0];
    if (seen.has(key)) throw new Error(`Duplicate daily option: ${key}`);
    seen.add(key);
    if (arg === "--native-daily") continue;
    if (arg === "--plan") { out.plan = true; continue; }
    if (/^--limit=\d+$/.test(arg)) {
      const n = Number(arg.slice(8));
      if (n < 1 || n > 20) throw new Error("Native daily limit must be 1–20.");
      out.limit = n; continue;
    }
    if (/^--max-follow=[01]$/.test(arg)) { out.followPages = Number(arg.slice(13)) as 0 | 1; continue; }
    throw new Error(`Unsupported native daily option: ${arg}`);
  }
  return out;
}

/** Rotate the bounded roster before freshness filtering. Failed early slugs cannot starve the tail. */
export function selectNativeCommerceRoster(
  places: readonly NativeCommercePlace[], records: Readonly<Record<string, CommerceRefreshRecord>>,
  now: Date, excludedDomains: string[], limit = 20,
) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Invalid daily clock or limit.");
  const seen = new Set<string>();
  for (const place of places) {
    if (!place.slug || seen.has(place.slug)) throw new Error(`Missing or duplicate public slug: ${place.slug}`);
    seen.add(place.slug);
  }
  const eligible = places.filter((p) => FOOD_DRINK_CATEGORIES.has(p.category) && p.website &&
    nativeCommerceUrl(p.website) && isEligibleOfficialBusinessWebsite(p.website, p.name, excludedDomains))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = eligible.length ? ((day * limit) % eligible.length + eligible.length) % eligible.length : 0;
  const roster = Array.from({ length: Math.min(limit, eligible.length) }, (_, i) => eligible[(start + i) % eligible.length]);
  const selected = roster.filter((place) => {
    const source = records[place.slug]?.commerce_source;
    const checked = source?.checkedAt ? Date.parse(source.checkedAt) : NaN;
    const sameSource = source && nativeCommerceUrl(source.url) === nativeCommerceUrl(place.website!);
    return !sameSource || !Number.isFinite(checked) || checked > now.getTime() + 300_000 || now.getTime() - checked > NATIVE_COMMERCE_REFRESH_DAYS * 86_400_000;
  });
  return { eligible, roster, selected, day, start };
}

/** One free GET, no redirects, retries, credentials, JS, browser or provider fallback. Deadline includes body. */
export async function fetchNativeCommercePage(
  value: string, officialUrl: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<NativeCommercePage> {
  const url = nativeCommerceUrl(value, officialUrl);
  if (!url || !nativeCommerceUrl(officialUrl)) throw new Error("Rejected native commerce source URL.");
  const timeout = options.timeoutMs ?? NATIVE_COMMERCE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? NATIVE_COMMERCE_MAX_BYTES;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 20_000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024) throw new Error("Invalid native page budget.");
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeout;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Native page deadline exceeded.")); }, timeout); });
  const work = (async () => {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "FrederickRadiusOfficialLinks/1.0 (+https://frederickradius.app)" },
    });
    if (controller.signal.aborted || !response.ok || response.redirected || (response.url && response.url !== url)) {
      await response.body?.cancel(); throw new Error("Native source failed or redirected.");
    }
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new Error("Native source is not HTML."); }
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) { await response.body?.cancel(); throw new Error("Native source exceeds body limit."); }
    if (!response.body) throw new Error("Native source has no body.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0; let reads = 0;
    const cancelBody = () => { void reader.cancel().catch(() => undefined); };
    controller.signal.addEventListener("abort", cancelBody, { once: true });
    try {
      while (true) {
        // Immediate/empty chunks can keep the microtask queue busy enough to
        // delay the timer. Both work count and wall time are hard bounds.
        if (Date.now() >= deadlineAt) { controller.abort(); throw new Error("Native page deadline exceeded."); }
        if (++reads > 2048) { controller.abort(); throw new Error("Native source exceeds stream-read limit."); }
        const part = await reader.read();
        if (Date.now() >= deadlineAt) { controller.abort(); throw new Error("Native page deadline exceeded."); }
        if (part.done) break;
        if (controller.signal.aborted) throw new Error("Native page deadline exceeded.");
        bytes += part.value.byteLength;
        if (bytes > maxBytes) throw new Error("Native source exceeds body limit.");
        chunks.push(part.value);
      }
    } finally { controller.signal.removeEventListener("abort", cancelBody); await reader.cancel().catch(() => undefined); }
    if (controller.signal.aborted) throw new Error("Native page deadline exceeded.");
    const html = Buffer.concat(chunks).toString("utf8");
    const links = extractPageAnchors(html, url, 1000);
    if (!links.length) throw new Error("No static source anchors; rendering is not enabled in daily mode.");
    return { url, links, bytes };
  })();
  try { return await Promise.race([work, deadline]); }
  finally { clearTimeout(timer!); }
}

/** Stable object formatting is ignored; only this exact observation timestamp is nonsemantic. */
export function commerceSemanticValue(value: unknown): string {
  function stable(v: unknown, path: string[]): unknown {
    if (Array.isArray(v)) return v.map((item) => stable(item, path));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
      .filter(([key]) => !(path.length === 1 && path[0] === "commerce_source" && key === "checkedAt"))
      .map(([key, child]) => [key, stable(child, [...path, key])]));
    return v;
  }
  return JSON.stringify(stable(value, [])) ?? "undefined";
}

export async function runNativeCommerceRefresh(input: {
  places: readonly NativeCommercePlace[]; existing: Readonly<Record<string, CommerceRefreshRecord>>;
  excludedDomains: string[]; options: NativeCommerceOptions; now?: Date; fetchImpl?: typeof fetch;
  observationClock?: () => Date;
}) {
  if (input.options.followPages !== 0 && input.options.followPages !== 1) throw new Error("Native daily follows at most one page.");
  const now = input.now ?? new Date();
  const queue = selectNativeCommerceRoster(input.places, input.existing, now, input.excludedDomains, input.options.limit);
  const records: Record<string, CommerceRefreshRecord> = { ...input.existing };
  const results: NativeCommerceSourceResult[] = new Array(queue.selected.length);
  let checked = 0; let failed = 0; let safeHolds = 0; let semantic = false; let requests = 0; let index = 0;
  if (!input.options.plan) await Promise.all(Array.from({ length: Math.min(2, queue.selected.length) }, async () => {
    while (true) {
      const current = index++; if (current >= queue.selected.length) return;
      const place = queue.selected[current]; let pages = 0;
      try {
        const url = nativeCommerceUrl(place.website!)!;
        requests++; const home = await fetchNativeCommercePage(url, url, { fetchImpl: input.fetchImpl }); pages++;
        const groups = [classifyOfficialCommerceLinks(home.links, home.url)];
        const sameHost = home.links.filter((anchor) => nativeCommerceUrl(anchor.url, url));
        const follow = selectCommerceDiscoveryPages(sameHost, url, home.url, input.options.followPages);
        for (const followUrl of follow) {
          requests++; const page = await fetchNativeCommercePage(followUrl, url, { fetchImpl: input.fetchImpl }); pages++;
          groups.push(classifyOfficialCommerceLinks(page.links, page.url));
        }
        // The classifier ranks a full menu above dish/category pages. Public
        // action selection consumes this order; semantic formatting must not reorder it.
        const links = filterCommerceLinksForPlace(mergeDistinctCommerceLinks(groups), { postalCode: place.postal_code });
        const observed = (input.observationClock ?? (() => new Date()))();
        if (!Number.isFinite(observed.getTime())) throw new Error("Invalid observation clock.");
        const prior = sanitizeStoredCommerceLinks(input.existing[place.slug]?.commerce_links, { postalCode: place.postal_code });
        const missing = prior.filter((old) => !links.some((found) => found.type === old.type && found.url === old.url));
        if (missing.length) {
          // A home page plus one index is partial discovery, not proof that a
          // previously approved PDF/deep link is dead. Keep its entire record
          // and old observation untouched; stage only a private review candidate.
          checked++; safeHolds++; semantic = true;
          results[current] = { slug: place.slug, ok: true, pages_read: pages, links: links.length,
            reason: "Accepted commerce destinations were not reobserved in the bounded pages; prior record and observation retained.",
            safe_hold: "prior_destinations_not_reobserved", missing_prior_links: missing.map(({ type, url: previousUrl }) => ({ type, url: previousUrl })),
            candidate: { name: place.name, commerce_links: links, commerce_source: { url, checkedAt: observed.toISOString() } } };
          continue;
        }
        const next = mergeCommerceRefresh(input.existing[place.slug], { name: place.name, links, sourceUrl: url, checkedAt: observed.toISOString() });
        if (commerceSemanticValue(next) !== commerceSemanticValue(input.existing[place.slug])) semantic = true;
        records[place.slug] = next; checked++;
        results[current] = { slug: place.slug, ok: true, pages_read: pages, links: links.length, reason: null };
      } catch (error) {
        failed++;
        results[current] = { slug: place.slug, ok: false, pages_read: pages, links: 0, reason: error instanceof Error ? error.message : String(error) };
      }
    }
  }));
  return { records, native_daily: true, plan: input.options.plan, eligible_count: queue.eligible.length,
    roster: queue.roster.map((p) => p.slug), selected: queue.selected.map((p) => p.slug), selected_count: queue.selected.length,
    checked_count: checked, failed_count: failed, safe_hold_count: safeHolds, requests, review_required: semantic,
    destination_verification: "not_performed", results: results.filter(Boolean) };
}
