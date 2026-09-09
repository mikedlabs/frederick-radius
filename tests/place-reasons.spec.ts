import { describe, it, expect } from "vitest";
import { placeReasons } from "@/lib/place-reasons";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { OpenStatus } from "@/lib/hours";

const OPEN: OpenStatus = { state: "open", closesAt: "9:00 PM", closingSoon: false };
const CLOSED: OpenStatus = { state: "closed" };
const CARROLL_CREEK = { lng: -77.4109, lat: 39.4137 };
const FAR = { lng: -77.9, lat: 39.9 };

function place(o: Partial<PlaceCardData> & { category: string }): PlaceCardData {
  return {
    slug: "x",
    name: "X",
    geom: FAR,
    open_status: CLOSED,
    feature_score: 5,
    ...o,
  } as unknown as PlaceCardData;
}

const kinds = (p: PlaceCardData) => placeReasons(p).map((r) => r.kind);

describe("placeReasons — extended intent reasons", () => {
  it("kid_friendly for clear kid categories (family, playground)", () => {
    expect(kinds(place({ category: "family" }))).toContain("kid_friendly");
    expect(kinds(place({ category: "playground" }))).toContain("kid_friendly");
    expect(kinds(place({ category: "coffee" }))).not.toContain("kid_friendly");
  });

  it("only claims free admission when the catalog explicitly supports it", () => {
    expect(kinds(place({ category: "park", tags: ["free"] }))).toContain("free");
    expect(kinds(place({ category: "trail", tags: ["free"] }))).toContain("free");
    expect(kinds(place({ category: "public-art", tags: ["free"] }))).toContain("free");
    expect(kinds(place({ category: "restaurant" }))).not.toContain("free");
    // "outdoors" used to be asserted here, but it is a PARENT slug: places are
    // filed under its children (park, trail, playground, golf, agritourism),
    // never under it, so the branch was unreachable in production.
    expect(kinds(place({ category: "outdoors" }))).not.toContain("free");
  });

  it("does not assume that state parks, national parks, or trails have free admission", () => {
    expect(kinds(place({ category: "park", name: "Cunningham Falls State Park" }))).not.toContain("free");
    expect(kinds(place({ category: "park", name: "National park" }))).not.toContain("free");
    expect(kinds(place({ category: "trail" }))).not.toContain("free");
  });

  it("near_landmark when within 500m of a curated landmark", () => {
    const r = placeReasons(place({ category: "coffee", geom: CARROLL_CREEK }));
    const lm = r.find((x) => x.kind === "near_landmark");
    expect(lm?.label).toBe("Near Carroll Creek");
  });

  it("no near_landmark when far from every landmark", () => {
    expect(kinds(place({ category: "coffee", geom: FAR }))).not.toContain("near_landmark");
  });

  it("emits only ONE intent reason (free wins over landmark for a park on the creek)", () => {
    const r = kinds(place({ category: "park", tags: ["free"], geom: CARROLL_CREEK }));
    expect(r).toContain("free");
    expect(r).not.toContain("near_landmark");
  });

  it("dog_friendly from the tag, outranking free/landmark but not kid-friendly", () => {
    // A restaurant carrying the real dog-friendly tag surfaces it.
    expect(kinds(place({ category: "restaurant", tags: ["dog-friendly"] }))).toContain("dog_friendly");
    // Outranks "Free": a dog-friendly park shows Dog-friendly, not Free.
    const park = kinds(place({ category: "park", tags: ["dog-friendly"] }));
    expect(park).toContain("dog_friendly");
    expect(park).not.toContain("free");
    // A kid category still wins the single intent slot.
    const family = kinds(place({ category: "family", tags: ["dog-friendly"] }));
    expect(family).toContain("kid_friendly");
    expect(family).not.toContain("dog_friendly");
    // No tag, no chip — never a guess.
    expect(kinds(place({ category: "restaurant" }))).not.toContain("dog_friendly");
  });
});

describe("placeReasons — cap & priority unchanged", () => {
  it("shows measured proximity without inventing a walk time or a walkable route", () => {
    const nearby = placeReasons(place({ category: "coffee", distance_m: 100 }));
    expect(nearby.find((reason) => reason.kind === "near")?.label).toBe("328 ft away");
    const acrossRiver = placeReasons(place({ category: "coffee", distance_m: 900 }));
    expect(acrossRiver.find((reason) => reason.kind === "near")?.label).toBe("0.6 mi away");
    expect([...nearby, ...acrossRiver].some((reason) => /walk/i.test(reason.label))).toBe(false);
  });

  it.each([NaN, Infinity, -100])("does not show invalid proximity %s", (distance_m) => {
    expect(kinds(place({ category: "coffee", distance_m }))).not.toContain("near");
  });

  it("does not describe a future hours timestamp as recently checked", () => {
    const reasons = placeReasons(place({ category: "coffee", hours_verified: true, hours_updated_at: "2026-09-07T12:00:00Z" }), new Date("2026-09-06T12:00:00Z"));
    expect(reasons.some((reason) => reason.kind === "hours_checked")).toBe(false);
  });

  it("stays capped at 3", () => {
    const r = placeReasons(
      place({
        category: "family",
        open_status: OPEN,
        open_confidence: "verified",
        distance_m: 100,
        local_favorite: true,
        last_verified_at: new Date().toISOString(),
      }),
    );
    expect(r.length).toBe(3);
  });

  it("priority: open → distance → intent survive the cap (quality/freshness drop)", () => {
    const r = kinds(
      place({
        category: "family",
        open_status: OPEN,
        open_confidence: "verified",
        distance_m: 100, // ~1 min walk
        local_favorite: true,
        last_verified_at: new Date().toISOString(),
      }),
    );
    expect(r).toEqual(["verified_open", "near", "kid_friendly"]);
  });
});
