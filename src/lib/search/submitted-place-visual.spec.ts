import { describe, expect, it } from "vitest";
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import { freeSearchPlaceVisual } from "./place-visual";
import { submittedSearchPlaceVisuals } from "./submitted-place-visual";

const paidCandidates = clientPlaces().filter((place) => place.google_photo_url && !freeSearchPlaceVisual(place)).slice(0, 8);
const creek = clientPlaceBySlug("carroll-creek-linear-park-frederick")!;
const falls = clientPlaceBySlug("cunningham-falls-state-park-thurmont")!;
const eligible = new Set(paidCandidates.map((place) => place.slug));

describe("submitted Search media allowance", () => {
  it("counts only individually credited Google media against the existing four-photo limit", () => {
    const sources = [...submittedSearchPlaceVisuals([creek, falls, ...paidCandidates], 4, new Set(paidCandidates.slice(0, 2).map((place) => place.slug))).values()];
    expect(sources.filter((source) => source.kind === "google")).toHaveLength(2);
    expect(sources.filter((source) => source.kind !== "google")).toHaveLength(2);
    for (const source of sources) {
      if (source.kind !== "google") continue;
      expect(source.src).toContain("fallback=signal");
      expect(source.attribution.google_maps_uri).toMatch(/^https:\/\/.*google\.com\/maps\//);
      expect(source.attribution.photo_name).toBeTruthy();
    }
  });

  it("does not refill paid slots outside original rank eligibility, including a non-place leading row", () => {
    const sources = submittedSearchPlaceVisuals([creek, falls, ...paidCandidates], 4, new Set([paidCandidates[0].slug]));
    expect([...sources.keys()]).toEqual([creek.slug, falls.slug, paidCandidates[0].slug]);
    expect([...submittedSearchPlaceVisuals(paidCandidates, 4, eligible).values()].filter((source) => source.kind === "google")).toHaveLength(4);
  });

  it("keeps free sources at zero allowance and rejects nonfinite paid budgets", () => {
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const sources = submittedSearchPlaceVisuals([creek, falls, ...paidCandidates], limit, eligible);
      expect([...sources.keys()]).toEqual([creek.slug, falls.slug]);
    }
  });

  it("fails closed when the source binding is absent or its slug no longer matches", () => {
    const original = paidCandidates[0];
    const noPolicy = { ...original, google_photo_policy_passed: false };
    const wrongIdentity = { ...original, google_photo_url: original.google_photo_url!.replace(`slug=${original.slug}`, "slug=unrelated-place") };
    expect(submittedSearchPlaceVisuals([noPolicy], 4, eligible).size).toBe(0);
    expect(submittedSearchPlaceVisuals([wrongIdentity], 4, eligible).size).toBe(0);
  });

  it("never restores Google images rejected by reviewed curated priority", () => {
    const places = ["barbara-fritchie-house-frederick", "catoctin-furnace-thurmont"].map((slug) => clientPlaceBySlug(slug)!);
    const sources = [...submittedSearchPlaceVisuals(places, 4, eligible).values()];
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.kind === "curated")).toBe(true);
  });

  it("does not charge the same repeated result twice", () => {
    expect(submittedSearchPlaceVisuals([paidCandidates[0], paidCandidates[0], paidCandidates[1]], 2, eligible).size).toBe(2);
  });
});
