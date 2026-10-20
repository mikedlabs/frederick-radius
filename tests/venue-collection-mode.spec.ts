import { describe, expect, it } from "vitest";
import config from "../config/venue-sources.json";
import { parseVenueCollectionArgs, selectVenueCollectionSources } from "../scripts/lib/venue-collection-mode";
const selected = (args: string[]) => selectVenueCollectionSources(config.venues, parseVenueCollectionArgs(args)).map(({ slug }) => slug);
describe("explicit native venue collection", () => {
  it("defaults to exactly the three reviewed native sources", () => {
    expect(selected([])).toEqual(["banyan", "weinberg-center", "new-spire"]);
    expect(selected(["--deterministic-only"])).toEqual(selected([]));
  });
  it("accepts a focused native slug and requires explicit paid admission for other methods", () => {
    expect(selected(["banyan"])).toEqual(["banyan"]);
    expect(() => selected(["sky-stage"])).toThrow(/mode/);
    expect(selected(["sky-stage", "--include-model-sources"])).toEqual(["sky-stage"]);
    expect(selected(["--include-model-sources"])).toHaveLength(config.venues.length);
  });
  it.each([["--unknown"], ["unknown-venue"], ["../banyan"], ["banyan", "new-spire"], ["--deterministic-only", "--include-model-sources"], ["--deterministic-only", "--deterministic-only"]].map((args) => ({ args })))("rejects ambiguous/invalid selection $args before collection", ({ args }) => {
    expect(() => selected(args)).toThrow();
  });
  it("does not silently enroll another feed or a changed/duplicated reviewed source", () => {
    expect(selectVenueCollectionSources([...config.venues, { slug: "another-feed", method: "feed" }], parseVenueCollectionArgs([]))).toHaveLength(3);
    expect(() => selectVenueCollectionSources(config.venues.map((v) => v.slug === "banyan" ? { ...v, method: "fetch" } : v), parseVenueCollectionArgs([]))).toThrow(/cohort/);
    expect(() => selectVenueCollectionSources([...config.venues, config.venues[0]], parseVenueCollectionArgs([]))).toThrow(/cohort/);
    expect(() => selectVenueCollectionSources([config.venues[0], config.venues[0], config.venues[1]], parseVenueCollectionArgs([]))).toThrow(/cohort/);
  });
});
