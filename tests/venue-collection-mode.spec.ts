import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collect,
  type VenueCollectDependencies,
  type VenueSource,
} from "../scripts/ingest-venue-events";
import { emptyVenueSourceState } from "../scripts/lib/venue-source-state";
import {
  isDeterministicVenueSource,
  parseVenueCollectionArgs,
  selectVenueCollectionSources,
} from "../scripts/lib/venue-collection-mode";

const sources = [
  { slug: "banyan", method: "feed" },
  { slug: "weinberg-center", method: "weinberg" },
  { slug: "new-spire", method: "weinberg" },
  { slug: "calendar-image", method: "image" },
  { slug: "static-page", method: "fetch" },
  { slug: "rendered-page", method: "render" },
  { slug: "legacy-render", render: true },
  { slug: "legacy-fetch" },
  { slug: "future-method", method: "unreviewed-method" },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("venue collection selection", () => {
  it("retains full collection and the existing one-venue selector by default", () => {
    const all = selectVenueCollectionSources(sources, parseVenueCollectionArgs([]));
    expect(all).toEqual(sources);
    expect(all).not.toBe(sources);
    expect(
      selectVenueCollectionSources(sources, parseVenueCollectionArgs(["calendar-image"])),
    ).toEqual([sources[3]]);
  });

  it("selects only reviewed free methods without model configuration", () => {
    expect(
      selectVenueCollectionSources(sources, parseVenueCollectionArgs(["--deterministic-only"])),
    ).toEqual(sources.slice(0, 3));
  });

  it("collects the selected official feeds without touching model prerequisites or page extraction", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const unexpectedFetch = vi.fn(async () => {
      throw new Error("This selection must use only the stubbed official collectors.");
    });
    vi.stubGlobal("fetch", unexpectedFetch);
    const registry: VenueSource[] = [
      { slug: "banyan", name: "The Banyan", method: "feed", urls: ["https://banyan.example/music"] },
      {
        slug: "weinberg-center", name: "Weinberg Center", method: "weinberg",
        venueFilter: "weinberg-center", urls: ["https://weinberg.example/performances"] },
      {
        slug: "new-spire", name: "New Spire", method: "weinberg",
        venueFilter: "new-spire-arts", urls: ["https://weinberg.example/new-spire"] },
      { slug: "calendar-image", name: "Image calendar", method: "image", imageUrl: "https://venue.example/calendar.png", urls: [] },
      { slug: "static-page", name: "Static calendar", method: "fetch", urls: ["https://venue.example/events"] },
      { slug: "rendered-page", name: "Rendered calendar", method: "render", urls: ["https://venue.example/events"] },
      { slug: "legacy-render", name: "Legacy rendered calendar", render: true, urls: ["https://venue.example/events"] },
      { slug: "legacy-fetch", name: "Legacy static calendar", urls: ["https://venue.example/events"] },
    ];
    const ensureModelReady = vi.fn(async () => false);
    const dependencies: VenueCollectDependencies = {
      fetchSquarespaceEventsResult: vi.fn(async () => ({
        status: "success" as const,
        events: [{ title: "Banyan performance", starts_at: "2026-10-09T19:00:00-04:00" }],
      })),
      fetchWeinbergEventsResult: vi.fn(async (sourceUrl, options) => ({
        status: "success" as const,
        events: [{ title: `${options.venueFilter} performance`, starts_at: "2026-10-09T20:00:00-04:00" }],
        sourceUrl,
        foundCards: 1,
      })),
      fetchPageSnapshot: vi.fn(async () => null),
      extractTextEvents: vi.fn(async () => null),
      extractImageEvents: vi.fn(async () => null),
    };
    const selected = selectVenueCollectionSources(
      registry,
      parseVenueCollectionArgs(["--deterministic-only"]),
    );
    const state = emptyVenueSourceState();
    const results = [];
    for (const source of selected) {
      results.push(await collect(source, state, ensureModelReady, false, dependencies));
    }

    expect(results.map((result) => result.status)).toEqual(["complete", "complete", "complete"]);
    expect(results.flatMap((result) => result.events.map((event) => event.title))).toEqual([
      "Banyan performance", "weinberg-center performance", "new-spire-arts performance",
    ]);
    expect(dependencies.fetchSquarespaceEventsResult).toHaveBeenCalledExactlyOnceWith("https://banyan.example/music");
    expect(dependencies.fetchWeinbergEventsResult).toHaveBeenCalledTimes(2);
    expect(ensureModelReady).not.toHaveBeenCalled();
    expect(dependencies.fetchPageSnapshot).not.toHaveBeenCalled();
    expect(dependencies.extractTextEvents).not.toHaveBeenCalled();
    expect(dependencies.extractImageEvents).not.toHaveBeenCalled();
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["--deterministic-only", "new-spire"],
    ["new-spire", "--deterministic-only"],
  ])("accepts one free venue selector in either argument order: %j", (...args) => {
    expect(
      selectVenueCollectionSources(sources, parseVenueCollectionArgs(args)),
    ).toEqual([sources[2]]);
  });

  it.each([
    ["--deterministic"],
    ["--deterministic-only=true"],
    ["--unknown"],
    ["-d"],
    ["--deterministic-only", "--deterministic-only"],
    ["banyan", "new-spire"],
    [""],
    [" banyan"],
    ["banyan "],
    ["Banyan"],
    ["../banyan"],
  ])("rejects malformed or ambiguous arguments: %j", (...args) => {
    expect(() => parseVenueCollectionArgs(args)).toThrow();
  });

  it("rejects an unknown venue instead of silently performing no work", () => {
    expect(() =>
      selectVenueCollectionSources(sources, parseVenueCollectionArgs(["not-a-venue"])),
    ).toThrow("Unknown venue slug: not-a-venue");
  });

  it("rejects a model-only selector in the free lane instead of falling back", () => {
    expect(() =>
      selectVenueCollectionSources(
        sources,
        parseVenueCollectionArgs(["--deterministic-only", "calendar-image"]),
      ),
    ).toThrow("No deterministic venue sources match the selection.");
  });

  it("rejects a registry with no matching sources in either mode", () => {
    expect(() =>
      selectVenueCollectionSources([], parseVenueCollectionArgs([])),
    ).toThrow("No venue sources match the selection.");
    expect(() =>
      selectVenueCollectionSources(
        sources.slice(3),
        parseVenueCollectionArgs(["--deterministic-only"]),
      ),
    ).toThrow("No deterministic venue sources match the selection.");
  });
});

describe("deterministic venue policy", () => {
  it.each(["feed", "weinberg"])("allows the %s method", (method) => {
    expect(isDeterministicVenueSource({ method })).toBe(true);
  });

  it.each(["image", "render", "fetch", "unreviewed-method", undefined])(
    "withholds model and unreviewed methods: %s",
    (method) => {
      expect(isDeterministicVenueSource({ method })).toBe(false);
      expect(isDeterministicVenueSource({ method, render: true })).toBe(false);
    },
  );
});
