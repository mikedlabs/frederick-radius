import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
export type NativeCommercePlace = { slug: string; name: string; category: string; website?: string; address?: string; city?: string; state?: string; municipality?: string; postal_code?: string; phone?: string };
export type NativeCommerceOptions = { limit: number; followPages: 0 | 1; plan: boolean };
export type NativeCommerceResponseEvidence = Readonly<{
  source_url: string; observed_at: string; source_sha256: string; bytes: number;
  content_type: string; status: number; html: string;
  /** Actual response URL when the transport provides one; absence is unknown. */
  response_url?: string | null;
}>;
/** Canonical identity is context for review, not a claim that the page matches it. */
export type NativeCommerceEvidence = NativeCommerceResponseEvidence & Readonly<{
  source_revision: string; identity: Readonly<NativeCommercePlace>;
}>;
export type NativeCommerceEvidenceCapture = (evidence: NativeCommerceEvidence, originalBytes: Uint8Array) => void;
export type NativeCommercePage = { url: string; links: PageAnchor[]; bytes: number; evidence: NativeCommerceResponseEvidence };
export type NativeCommerceSourceResult = {
  slug: string; ok: boolean; pages_read: number; links: number; reason: string | null;
  source_url: string; failed_url?: string;
  safe_hold?: "prior_destinations_not_reobserved";
  missing_prior_links?: Pick<ExtractedBusinessCommerceLink, "type" | "url">[];
  /** Source-found candidate only, kept in private diagnostics, never applied on a hold. */
  candidate?: { name: string; commerce_links: ExtractedBusinessCommerceLink[]; commerce_source: { url: string; checkedAt: string } };
};

class NativeCommerceEvidenceError extends Error {
  constructor() { super("Private native evidence could not be preserved; this source is held."); }
}

/** A fresh private directory preserves originals before any link projection.
 * Only this diagnostic artifact receives HTML; public records and stdout do not.
 */
export function createNativeCommerceEvidenceWriter(directory: string, sourceRevision: string, intake?: (evidence: NativeCommerceEvidence) => unknown) {
  const root = resolve(directory);
  mkdirSync(root, { mode: 0o700 });
  const records: Omit<NativeCommerceEvidence, "html">[] = [];
  const files: { evidence_file: string; intake_file?: string }[] = [];
  const heldIntakes: unknown[] = [];
  const index = (final?: { selected: string[]; results: NativeCommerceSourceResult[]; evidence_capture_failed: boolean }) => writeFileSync(resolve(root, "index.json"), JSON.stringify({
    schema_version: 1, source_revision: sourceRevision,
    // Complete means each selected identity has an outcome, not that all pages
    // succeeded, matched their identity or supplied an accepted fact.
    collection_complete: !!final && final.results.length === final.selected.length && !final.evidence_capture_failed,
    records: records.map((record, i) => ({ ...record, ...files[i] })),
    ...(final ? { selected: final.selected, results: final.results, evidence_capture_failed: final.evidence_capture_failed } : {}),
  }, null, 2) + "\n", { mode: 0o600 });
  index();
  return {
    capture(evidence: NativeCommerceEvidence, originalBytes: Uint8Array) {
      const original = Buffer.from(originalBytes);
      if (evidence.source_revision !== sourceRevision || original.byteLength !== evidence.bytes
        || createHash("sha256").update(original).digest("hex") !== evidence.source_sha256) throw new Error("Mismatched original native commerce evidence.");
      const stem = `${String(records.length).padStart(2, "0")}-${createHash("sha256").update(evidence.source_url).digest("hex")}`;
      const evidenceFile = `${stem}.html`;
      // The byte copy is exact, including a non-UTF8 response that an extractor
      // must hold when its decoded HTML cannot reproduce the original digest.
      writeFileSync(resolve(root, evidenceFile), original, { mode: 0o600, flag: "wx" });
      const { html: _html, ...metadata } = evidence;
      void _html;
      records.push(metadata); files.push({ evidence_file: evidenceFile });
      index();
      if (intake) {
        const intakeFile = `${stem}.held-intake.json`;
        let held: unknown;
        try { held = intake(evidence); }
        catch {
          // A parser defect does not invalidate already captured source bytes
          // or otherwise valid commerce actions. No proposed fact is accepted.
          held = { schema_version: 1, status: "held", provenance: metadata, canonical_identity: metadata.identity,
            identity_state: "unmatched", reasons: ["intake_exception"], candidates: {}, review_requirements: ["Repair offline intake before reviewing new listing facts."] };
        }
        writeFileSync(resolve(root, intakeFile), JSON.stringify(held, null, 2) + "\n", { mode: 0o600, flag: "wx" });
        heldIntakes.push(held);
        files[files.length - 1].intake_file = intakeFile;
        index();
      }
    },
    finish: index,
    /** Compact facts remain held and survive the shorter original-body retention. */
    summary: () => ({ schema_version: 1, source_revision: sourceRevision,
      captures: records.map((record, i) => ({ ...record, ...files[i] })), held_candidates: heldIntakes }),
  };
}

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
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number; observationClock?: () => Date;
    onEvidence?: (evidence: NativeCommerceResponseEvidence, originalBytes: Uint8Array) => void } = {},
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
    const original = Buffer.concat(chunks);
    const html = original.toString("utf8");
    const observed = (options.observationClock ?? (() => new Date()))();
    if (!Number.isFinite(observed.getTime())) throw new Error("Invalid response observation clock.");
    const evidence: NativeCommerceResponseEvidence = Object.freeze({ source_url: url, response_url: response.url || null, observed_at: observed.toISOString(),
      source_sha256: createHash("sha256").update(original).digest("hex"), bytes,
      content_type: response.headers.get("content-type")!, status: response.status, html });
    // Capture first: a useful complete source may lack commerce anchors, or its
    // later follow page/actions may fail without invalidating this original.
    try { options.onEvidence?.(evidence, original); }
    catch { throw new NativeCommerceEvidenceError(); }
    const links = extractPageAnchors(html, url, 1000);
    if (!links.length) throw new Error("No static source anchors; rendering is not enabled in daily mode.");
    return { url, links, bytes, evidence };
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
  observationClock?: () => Date; sourceRevision?: string; onEvidence?: NativeCommerceEvidenceCapture;
}) {
  if (input.options.followPages !== 0 && input.options.followPages !== 1) throw new Error("Native daily follows at most one page.");
  const now = input.now ?? new Date();
  const queue = selectNativeCommerceRoster(input.places, input.existing, now, input.excludedDomains, input.options.limit);
  const records: Record<string, CommerceRefreshRecord> = { ...input.existing };
  const results: NativeCommerceSourceResult[] = new Array(queue.selected.length);
  let checked = 0; let failed = 0; let safeHolds = 0; let semantic = false; let requests = 0; let index = 0; let evidenceCaptureFailed = false;
  const sourceRevision = /^[a-f0-9]{40}$/.test(input.sourceRevision ?? "") ? input.sourceRevision! : "unknown";
  if (!input.options.plan) await Promise.all(Array.from({ length: Math.min(2, queue.selected.length) }, async () => {
    while (true) {
      const current = index++; if (current >= queue.selected.length) return;
      const place = queue.selected[current]; let pages = 0;
      const url = nativeCommerceUrl(place.website!)!; let attemptedUrl = url;
      const identity = Object.freeze({ slug: place.slug, name: place.name, category: place.category, website: place.website,
        address: place.address, city: place.city, state: place.state, municipality: place.municipality,
        postal_code: place.postal_code, phone: place.phone });
      const onEvidence = (evidence: NativeCommerceResponseEvidence, original: Uint8Array) => {
        pages++;
        input.onEvidence?.(Object.freeze({ ...evidence, source_revision: sourceRevision, identity }), original);
      };
      try {
        requests++; const home = await fetchNativeCommercePage(url, url, { fetchImpl: input.fetchImpl, observationClock: input.observationClock, onEvidence });
        const groups = [classifyOfficialCommerceLinks(home.links, home.url)];
        const sameHost = home.links.filter((anchor) => nativeCommerceUrl(anchor.url, url));
        const follow = selectCommerceDiscoveryPages(sameHost, url, home.url, input.options.followPages);
        for (const followUrl of follow) {
          attemptedUrl = followUrl;
          requests++; const page = await fetchNativeCommercePage(followUrl, url, { fetchImpl: input.fetchImpl, observationClock: input.observationClock, onEvidence });
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
            source_url: url,
            reason: "Accepted commerce destinations were not reobserved in the bounded pages; prior record and observation retained.",
            safe_hold: "prior_destinations_not_reobserved", missing_prior_links: missing.map(({ type, url: previousUrl }) => ({ type, url: previousUrl })),
            candidate: { name: place.name, commerce_links: links, commerce_source: { url, checkedAt: observed.toISOString() } } };
          continue;
        }
        const next = mergeCommerceRefresh(input.existing[place.slug], { name: place.name, links, sourceUrl: url, checkedAt: observed.toISOString() });
        if (commerceSemanticValue(next) !== commerceSemanticValue(input.existing[place.slug])) semantic = true;
        records[place.slug] = next; checked++;
        results[current] = { slug: place.slug, source_url: url, ok: true, pages_read: pages, links: links.length, reason: null };
      } catch (error) {
        if (error instanceof NativeCommerceEvidenceError) evidenceCaptureFailed = true;
        failed++;
        results[current] = { slug: place.slug, source_url: url, failed_url: attemptedUrl, ok: false, pages_read: pages, links: 0, reason: error instanceof Error ? error.message : String(error) };
      }
    }
  }));
  return { records, native_daily: true, plan: input.options.plan, eligible_count: queue.eligible.length,
    roster: queue.roster.map((p) => p.slug), selected: queue.selected.map((p) => p.slug), selected_count: queue.selected.length,
    checked_count: checked, failed_count: failed, safe_hold_count: safeHolds, requests, review_required: semantic,
    source_revision: sourceRevision, evidence_capture_failed: evidenceCaptureFailed,
    destination_verification: "not_performed", results: results.filter(Boolean) };
}
