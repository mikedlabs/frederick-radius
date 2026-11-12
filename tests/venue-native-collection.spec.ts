import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../config/venue-sources.json";
import { ingestVenueEvents, type VenueCollectDependencies, type VenueEvent, type VenueSource } from "../scripts/ingest-venue-events";
import { parseSquarespaceEvents } from "../scripts/lib/extract-agent";
import { parseWeinbergEventPage } from "../scripts/lib/weinberg-events";
import { emptyVenueSourceState } from "../scripts/lib/venue-source-state";
const NOW = new Date("2026-10-20T12:00:00Z");
const sources = config.venues as VenueSource[];
const modelReady = vi.fn(async () => { throw new Error("Native collection must not preflight a model."); });
function deps(failBanyan = false, throwBanyan = false): VenueCollectDependencies {
  return {
    fetchPageSnapshot: vi.fn(async () => { throw new Error("No render, page/model fallback or Firecrawl."); }),
    extractTextEvents: vi.fn(async () => { throw new Error("No model extraction."); }),
    extractImageEvents: vi.fn(async () => { throw new Error("No image model."); }),
    fetchSquarespaceEventsResult: vi.fn(async (url) => {
      if (throwBanyan) throw new Error("Interrupted native transport.");
      if (failBanyan) return { status: "failure" as const, events: [] as [] };
      return { status: "success" as const, events: parseSquarespaceEvents({ upcoming: [{ title: "Banyan show", startDate: Date.parse("2026-11-20T20:00-05:00"), fullUrl: "/livemusic/show" }] }, url) };
    }),
    fetchWeinbergEventsResult: vi.fn(async (url, options) => {
      const html = `<span id="query-info" data-found-posts="1"></span><article class="js-post"><a href="https://weinbergcenter.org/shows/${options.venueFilter}/"><h4 class="show-title">${options.venueFilter} performance</h4></a><div class="performance"><p class="show-date">Friday November 20, 2026</p><p class="show-time">8:00 PM</p></div></article>`;
      const parsed = parseWeinbergEventPage(html, url);
      return { status: "success" as const, sourceUrl: url, foundCards: parsed.foundCards ?? 1, events: parsed.events };
    }),
  };
}
async function run(existing: VenueEvent[] = [], dependencies = deps()) {
  return ingestVenueEvents([], { sources, existing, sourceState: emptyVenueSourceState(), collectDependencies: dependencies, ensureModelReady: modelReady, now: NOW, persist: false });
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("native venue publication through the real collector assembly", () => {
  it("parses all three native sources, preserves unselected inventory, never calls paid transports or writes snapshots", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const paths = ["venue-events.json", "venue-event-source-inventory.json", "venue-event-source-state.json", "data-release.json"];
    const hashes = () => paths.map((path) => createHash("sha256").update(readFileSync(`src/data/${path}`)).digest("hex"));
    const before = hashes();
    const retained: VenueEvent = { title: "Old paid source row", starts_at: "2026-08-01T20:00-04:00", venue_slug: "sky-stage", venue_name: "Sky Stage", source: { url: "https://www.skystagefrederick.com/", requestedUrl: "https://www.skystagefrederick.com/", finalUrl: "https://www.skystagefrederick.com/", fetchedAt: "2026-08-01T10:00:00Z" } };
    const dependencies = deps(); const result = await run([retained], dependencies);
    expect(result.outcomes).toEqual(["banyan", "weinberg-center", "new-spire"].map((slug) => ({ slug, status: "complete" })));
    expect(result.sourceInventory).toHaveLength(4);
    expect(result.sourceInventory.find((row) => row.venue_slug === "sky-stage")).toEqual(retained);
    expect(result.sourceInventory.find((row) => row.venue_slug === "weinberg-center")).toMatchObject({ title: "weinberg-center performance", starts_at: "2026-11-20T20:00-05:00", ticket_url: "https://weinbergcenter.org/shows/weinberg-center/", source: { fetchedAt: NOW.toISOString() } });
    expect(dependencies.fetchSquarespaceEventsResult).toHaveBeenCalledTimes(1);
    expect(dependencies.fetchWeinbergEventsResult).toHaveBeenCalledTimes(2);
    expect(dependencies.fetchPageSnapshot).not.toHaveBeenCalled();
    expect(dependencies.extractTextEvents).not.toHaveBeenCalled();
    expect(dependencies.extractImageEvents).not.toHaveBeenCalled();
    expect(modelReady).not.toHaveBeenCalled(); expect(hashes()).toEqual(before);
  });
  it.each([false, true])("retains failed native proof and advances other sources independently (throws=%s)", async (throws) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined);
    const baseline = await run();
    const old = baseline.sourceInventory.map((row) => ({ ...row, source: { ...row.source, fetchedAt: "2026-10-18T12:00:00Z" } }));
    const result = await run(old, deps(true, throws));
    expect(result.failedSources).toEqual(["banyan"]);
    expect(result.sourceInventory.find((row) => row.venue_slug === "banyan")).toEqual(old.find((row) => row.venue_slug === "banyan"));
    expect(result.sourceInventory.filter((row) => row.venue_slug !== "banyan").map((row) => row.source.fetchedAt)).toEqual([NOW.toISOString(), NOW.toISOString()]);
    expect(result.reviewRequired).toBe(false); expect(result.sourceState).toEqual(emptyVenueSourceState());
    expect(modelReady).not.toHaveBeenCalled();
  });
  it("makes a complete empty native inventory a review-required future removal", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const baseline = await run(); const dependencies = deps();
    dependencies.fetchSquarespaceEventsResult = async () => ({ status: "success" as const, events: [] });
    const result = await run(baseline.sourceInventory, dependencies);
    expect(result.sourceInventory).toHaveLength(2); expect(result.failedSources).toEqual([]);
    expect(result.reviewRequired).toBe(true); expect(result.futureRemovals).toBe(1);
  });
});
