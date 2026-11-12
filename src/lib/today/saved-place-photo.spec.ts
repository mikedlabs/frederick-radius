import { describe, expect, it } from "vitest";
import { localDiscoveryPlace, localDiscoveryPlaces } from "./discovery-places";
import { todaySavedPlacePhotoPlan } from "./saved-place-photo";

describe("Today saved place image eligibility", () => {
  it("reuses the exact accepted scenic identity across town scopes", () => {
    const slug = "catoctin-mountain-park";
    expect(todaySavedPlacePhotoPlan(slug)).toEqual(localDiscoveryPlace(slug)!.photoPlan);
    expect(localDiscoveryPlace(slug)?.town).toBe("Thurmont");
    expect(localDiscoveryPlaces("town:frederick").some(place => place.slug === slug)).toBe(false);
  });
  it.each(["ibiza-cafe", "sabor-de-cuba-frederick", "zoes-chocolate-co-frederick", "unknown-merchant"])("does not turn saving %s into merchant image approval", slug => {
    expect(todaySavedPlacePhotoPlan(slug).sources).toEqual([]);
  });
  it("permits only local reviewed scenic bytes without a provider endpoint", () => {
    for (const scope of ["county", "town:thurmont", "town:brunswick"] as const) {
      for (const place of localDiscoveryPlaces(scope)) {
        const plan = todaySavedPlacePhotoPlan(place.slug);
        expect(plan.sources.length).toBeGreaterThan(0);
        expect(plan.sources.every(source => source.kind !== "google" && source.src.startsWith("/") && !source.src.startsWith("/api/"))).toBe(true);
      }
    }
  });
});
