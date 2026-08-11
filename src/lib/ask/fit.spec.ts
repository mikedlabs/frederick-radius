import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import {
  askFitAccessNote,
  askFitBoost,
  askFitForQuery,
  askFitSummary,
  normalizeAskFitContext,
  placeAllowedByAskFit,
  qualifyAskAnswerForAccess,
  readAskFitContext,
  rerankWithAskFit,
  writeAskFitContext,
} from "./fit";

function place(input: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: "test-place",
    name: "Test place",
    category: "restaurant",
    short_blurb: "",
    address: "1 Test St",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    geom: { lng: -77.41, lat: 39.41 },
    is_verified: false,
    hours_verified: false,
    is_operational: "operational",
    feature_score: 1,
    source: "curated",
    updated_at: "2026-08-01",
    open_status: { state: "unknown", reason: "Hours not verified" },
    ...input,
  } as PlaceCardData;
}

describe("Ask fit context", () => {
  it("keeps only bounded enums and drops private or location-shaped fields", () => {
    expect(normalizeAskFitContext({
      travelMode: "walk",
      walkingTolerance: "short",
      accessibility: ["wheelchair", "wheelchair", "private-note"],
      family: "young-kids",
      budget: "value",
      notes: "do not send this",
      lat: 39.4,
      lng: -77.4,
    })).toEqual({
      travelMode: "walk",
      walkingTolerance: "short",
      accessibility: ["wheelchair"],
      family: "young-kids",
      budget: "value",
    });
    expect(normalizeAskFitContext({ travelMode: "transit" })).toEqual({});
    expect(normalizeAskFitContext({ travelMode: "drive" })).toEqual({});
  });

  it("round-trips the normalized context and clears an empty preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    writeAskFitContext({ travelMode: "walk", budget: "free" }, storage);
    expect(readAskFitContext(storage)).toEqual({ travelMode: "walk", budget: "free" });
    writeAskFitContext({}, storage);
    expect(readAskFitContext(storage)).toEqual({});
  });

  it("uses verified fit evidence as a bounded ranking nudge", () => {
    const accessibleFamilyPlace = place({
      slug: "accessible-family",
      distance_m: 500,
      tags: ["accessible", "kids-0-5", "free"],
      accessibility: { wheelchair: true },
    });
    const unknownPlace = place({ slug: "unknown", distance_m: 3_000 });
    const fit = normalizeAskFitContext({
      travelMode: "walk",
      walkingTolerance: "short",
      accessibility: ["wheelchair"],
      family: "young-kids",
      budget: "free",
    });
    expect(askFitBoost(accessibleFamilyPlace, fit)).toBeGreaterThan(askFitBoost(unknownPlace, fit));
    expect(askFitBoost(accessibleFamilyPlace, fit)).toBeLessThanOrEqual(2.5);
    expect(askFitSummary(fit)).toContain("wheelchair access");
    const ranked = rerankWithAskFit([
      { type: "place", place: unknownPlace, score: 10 },
      { type: "place", place: accessibleFamilyPlace, score: 9.5 },
    ], fit);
    expect(ranked[0]?.type === "place" ? ranked[0].place.slug : null).toBe("accessible-family");
  });

  it("excludes known inaccessible places and labels unknown access honestly", () => {
    const knownFalse = place({
      slug: "known-false",
      accessibility: { wheelchair: false },
    });
    const unknown = place({ slug: "unknown" });
    const confirmed = place({
      slug: "confirmed",
      accessibility: { wheelchair: true },
    });
    const fit = normalizeAskFitContext({ accessibility: ["wheelchair"] });

    const ranked = rerankWithAskFit([
      { type: "place", place: knownFalse, score: 20 },
      { type: "place", place: unknown, score: 10 },
      { type: "place", place: confirmed, score: 9 },
    ], fit);

    expect(ranked.flatMap((hit) => hit.type === "place" ? [hit.place.slug] : []))
      .not.toContain("known-false");
    expect(placeAllowedByAskFit(knownFalse, fit)).toBe(false);
    expect(placeAllowedByAskFit(unknown, fit)).toBe(true);
    expect(placeAllowedByAskFit(confirmed, fit)).toBe(true);
    expect(askFitAccessNote(unknown, fit)).toBe(
      "Wheelchair access is not confirmed",
    );
    expect(askFitAccessNote(confirmed, fit)).toBe(
      "Wheelchair access is recorded",
    );
    expect(qualifyAskAnswerForAccess(
      "Unknown Place is the closest match.",
      [{ ...unknown, name: "Unknown Place" }],
      fit,
    )).toBe(
      "Unknown Place is the closest match. Wheelchair access is not confirmed for Unknown Place.",
    );
    expect(qualifyAskAnswerForAccess(
      "Confirmed Place has recorded wheelchair access.",
      [{ ...confirmed, name: "Confirmed Place" }],
      fit,
    )).toBe("Confirmed Place has recorded wheelchair access.");
  });

  it("lets an explicit question override stored defaults", () => {
    const fit = normalizeAskFitContext({
      travelMode: "walk",
      walkingTolerance: "short",
      family: "young-kids",
      budget: "value",
      accessibility: ["communication"],
    });
    expect(askFitForQuery(fit, "Plan a long walk for two adults and splurge on dinner")).toEqual({
      accessibility: ["communication"],
    });
    expect(askFitForQuery(
      { accessibility: ["wheelchair", "communication"] },
      "Which places have ASL interpretation?",
    )).toEqual({ accessibility: ["wheelchair", "communication"] });
    expect(askFitForQuery(
      { accessibility: ["wheelchair", "communication"] },
      "I need step-free access and captions",
    )).toEqual({ accessibility: ["wheelchair", "communication"] });
    expect(askFitForQuery(
      {},
      "I need a wheelchair-accessible coffee shop",
    )).toEqual({ accessibility: ["wheelchair"] });
  });
});
