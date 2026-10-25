import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../config/venue-sources.json";
import { ingestVenueEvents, type VenueCollectDependencies, type VenueEvent, type VenueSource } from "../scripts/ingest-venue-events";
import { fetchSquarespaceEventsResult } from "../scripts/lib/extract-agent";
import { fetchWeinbergEventsResult } from "../scripts/lib/weinberg-events";
import { emptyVenueSourceState } from "../scripts/lib/venue-source-state";

const sources = config.venues as VenueSource[];
const banyan = sources.find(source => source.slug === "banyan")!;
const weinberg = sources.find(source => source.slug === "weinberg-center")!;
const spire = sources.find(source => source.slug === "new-spire")!;
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const canonical = ["venue-events.json", "venue-event-source-inventory.json", "venue-event-source-state.json", "data-release.json"];
const canonicalHashes = () => canonical.map(file => sha(readFileSync(`src/data/${file}`)));
const folders: string[] = [];
const forbidden = async () => { throw new Error("No model, render, Firecrawl or unselected native source is allowed in this test."); };

function prior(source: VenueSource): VenueEvent {
  return { title: `Previously reviewed ${source.name} performance`, starts_at: "2027-02-01T20:00-05:00", venue_slug: source.slug, venue_name: source.name, source: { url: source.urls[0], requestedUrl: source.urls[0], finalUrl: source.urls[0], fetchedAt: "2026-10-22T12:00:00.000Z" } };
}
function setupEvidence() {
  const root = mkdtempSync(join(tmpdir(), "radius-native-venue-review-")); folders.push(root);
  const directory = join(root, "capture");
  vi.stubEnv("NATIVE_VENUE_REVIEW_EVIDENCE_DIR", directory);
  vi.stubEnv("GITHUB_SHA", "1".repeat(40)); vi.stubEnv("GITHUB_RUN_ID", "2345"); vi.stubEnv("GITHUB_RUN_ATTEMPT", "1");
  return { directory, index: () => JSON.parse(readFileSync(join(directory, "index.json"), "utf8")) };
}
function dependencies(fetchImpl: typeof fetch): VenueCollectDependencies {
  return {
    fetchPageSnapshot: vi.fn(forbidden), extractTextEvents: vi.fn(forbidden), extractImageEvents: vi.fn(forbidden),
    fetchSquarespaceEventsResult: vi.fn((url, options) => fetchSquarespaceEventsResult(url, { ...options, fetchImpl })),
    fetchWeinbergEventsResult: vi.fn((url, options) => fetchWeinbergEventsResult(url, { ...options, fetchImpl })),
  };
}
function reply(body: Uint8Array | string): Response {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), { headers: { "content-type": "application/json" } });
}
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(forbidden));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe("native venue originals through the real collector assembly", () => {
  it.each([
    ["malformed JSON", Buffer.from('{"upcoming": [malformed original')],
    ["invalid UTF-8", Buffer.from([0x7b, 0xc3, 0x28, 0x7d])],
  ])("retains exact %s bytes privately, keeps failed/unselected facts and holds the failed run", async (_label, raw) => {
    const evidence = setupEvidence(), before = canonicalHashes(), old = [prior(banyan), prior(weinberg)];
    const fetchImpl = vi.fn(async () => reply(raw)) as typeof fetch, deps = dependencies(fetchImpl), model = vi.fn(forbidden);
    const result = await ingestVenueEvents(["--deterministic-only", "banyan"], { sources: [banyan, weinberg], existing: old, sourceState: emptyVenueSourceState(), collectDependencies: deps, ensureModelReady: model, persist: false });
    expect(result.sourceInventory).toEqual(old); expect(result.publishedEvents).toEqual(old);
    expect(result.failedSources).toEqual(["banyan"]); expect(result.outcomes.every(row => row.status === "failed")).toBe(true);
    const index = evidence.index(); expect(index.semantic_acceptance).toBe(false); expect(index.generated_outputs_bound).toBe(false);
    expect(index.records).toHaveLength(1); expect(index.records[0]).toMatchObject({ source_id: "banyan", body_state: "captured", source_sha256: sha(raw), bytes: raw.length });
    expect(readFileSync(join(evidence.directory, index.records[0].evidence_file))).toEqual(raw);
    expect(index.source_outcomes).toEqual(expect.arrayContaining([{ source_id: "weinberg-center", status: "unselected" }, expect.objectContaining({ source_id: "banyan", status: "failed" })]));
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(deps.fetchWeinbergEventsResult).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(canonicalHashes()).toEqual(before);
  });

  it("preserves landing and every partial pagination response while withholding partial new events", async () => {
    const evidence = setupEvidence(), before = canonicalHashes(), old = [prior(weinberg), prior(spire)];
    const landing = '<div class="js-post-container" data-post-type="shows"><article class="js-post"></article></div><input id="more_posts_nonce" value="fixture-nonce" />';
    const first = JSON.stringify({ success: true, data: '<span id="query-info" data-found-posts="2"></span><article class="js-post"><a href="https://weinbergcenter.org/shows/new-unaccepted-performance/"><h4 class="show-title">New unaccepted performance</h4></a><div class="performance"><p class="show-date">Monday February 1, 2027</p><p class="show-time">8:00 PM</p></div></article>' });
    const malformed = '{"success": true, "data": incomplete';
    const responses = [landing, first, malformed]; let request = 0;
    const fetchImpl = vi.fn(async () => reply(responses[request++])) as typeof fetch, deps = dependencies(fetchImpl);
    const result = await ingestVenueEvents(["--deterministic-only", "weinberg-center"], { sources: [weinberg, spire], existing: old, sourceState: emptyVenueSourceState(), collectDependencies: deps, ensureModelReady: vi.fn(forbidden), persist: false });
    expect(result.failedSources).toEqual(["weinberg-center"]); expect(result.sourceInventory).toEqual(old); expect(result.publishedEvents).toEqual(old);
    expect(result.sourceInventory.some(row => row.title === "New unaccepted performance")).toBe(false);
    const index = evidence.index(); expect(index.records).toHaveLength(3); expect(index.semantic_acceptance).toBe(false);
    expect(index.records.map((row: { method: string }) => row.method)).toEqual(["GET", "POST", "POST"]);
    for (const [i, raw] of responses.entries()) {
      expect(index.records[i]).toMatchObject({ source_id: "weinberg-center", body_state: "captured", source_sha256: sha(raw) });
      expect(readFileSync(join(evidence.directory, index.records[i].evidence_file), "utf8")).toBe(raw);
    }
    expect(index.records[1].request_context).toMatchObject({ phase: "pagination", venue_filter: "weinberg-center", offset: 0 });
    expect(index.records[2].request_context).toMatchObject({ phase: "pagination", venue_filter: "weinberg-center", offset: 1 });
    expect(index.source_outcomes).toEqual(expect.arrayContaining([{ source_id: "new-spire", status: "unselected" }, expect.objectContaining({ source_id: "weinberg-center", status: "failed" })]));
    expect(fetchImpl).toHaveBeenCalledTimes(3); expect(deps.fetchSquarespaceEventsResult).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled(); expect(canonicalHashes()).toEqual(before);
  });

  it.each(["storage", "identity"])("stops all later venue reads after the first %s capture failure", async kind => {
    const evidence = setupEvidence(), before = canonicalHashes(), raw = '{"upcoming":[]}';
    const fetchImpl = vi.fn(async () => {
      if (kind === "storage") writeFileSync(join(evidence.directory, `001-${sha(raw)}.body`), "existing protected bytes", { flag: "wx" });
      const response = reply(raw);
      if (kind === "identity") Object.defineProperty(response, "url", { value: "https://unreviewed.example/feed" });
      return response;
    }) as typeof fetch;
    const deps = dependencies(fetchImpl), old = [prior(banyan), prior(weinberg), prior(spire)];
    await expect(ingestVenueEvents(["--deterministic-only"], { sources: [banyan, weinberg, spire], existing: old, sourceState: emptyVenueSourceState(), collectDependencies: deps, ensureModelReady: vi.fn(forbidden), persist: false })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(deps.fetchWeinbergEventsResult).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled(); expect(canonicalHashes()).toEqual(before);
    const index = evidence.index(); expect(index.capture_failed).toBe(true); expect(index.collection_complete).toBe(false); expect(index.generated_outputs_bound).toBe(false); expect(index.semantic_acceptance).toBe(false);
    if (kind === "storage") expect(readFileSync(join(evidence.directory, `001-${sha(raw)}.body`), "utf8")).toBe("existing protected bytes");
    expect(existsSync(join(evidence.directory, "index.json"))).toBe(true);
  });
});
