import { describe, expect, it } from "vitest";
import { buildTasteProfile, normalizeTasteSignals, tasteBoost } from "./taste";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

describe("Ask taste signals", () => {
  it("keeps only bounded, explicit slug-like values", () => {
    const signals = normalizeTasteSignals({
      savedPlaceSlugs: ["cafe-nola", "cafe-nola", "../secret", 42],
      interests: ["food", "LIVE MUSIC", "bad value"],
    });
    expect(signals.savedPlaceSlugs).toEqual(["cafe-nola"]);
    expect(signals.interests).toEqual(["food", "live-music", "bad-value"]);
  });

  it("builds an explainable profile only from real saved places", () => {
    const profile = buildTasteProfile(normalizeTasteSignals({
      savedPlaceSlugs: ["cafe-nola", "not-a-real-place"],
      interests: ["coffee"],
    }));
    expect(profile).not.toBeNull();
    expect(profile?.signalCount).toBe(2);
    const saved = clientPlaceBySlug("cafe-nola");
    expect(saved).toBeDefined();
    expect(tasteBoost(saved!, profile!)).toBeGreaterThan(0);
  });

  it("does not invent a profile when the user supplied no signals", () => {
    expect(buildTasteProfile(normalizeTasteSignals(null))).toBeNull();
  });
});
