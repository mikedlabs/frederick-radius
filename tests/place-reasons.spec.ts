import { describe, it, expect } from "vitest";
import {
  isDestinationCategory,
  placeReasons,
  placeRowMark,
  streetLine,
} from "@/lib/place-reasons";
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

describe("placeReasons — row audit, October 2026", () => {
  it("drops the proximity chip when the surface prints the distance itself", () => {
    const p = place({ category: "coffee", distance_m: 68 });
    expect(kinds(p)).toContain("near");
    expect(
      placeReasons(p, new Date(), { distanceShown: true }).map((r) => r.kind),
    ).not.toContain("near");
  });

  it.each([
    "shopping",
    "book-store",
    "market",
    "services",
    "auto-care",
    "salon",
    "wellness",
    "civic",
    "worship",
    "lodging",
  ])("never prints Local favorite on the %s category", (category) => {
    expect(kinds(place({ category, local_favorite: true }))).not.toContain("local_favorite");
  });

  it.each(["restaurant", "coffee", "brewery", "park", "museum", "family"])(
    "still prints Local favorite on the destination category %s",
    (category) => {
      expect(kinds(place({ category, local_favorite: true }))).toContain("local_favorite");
    },
  );

  it("lets a shop with a strong rating fall through to Top rated", () => {
    const shop = place({
      category: "shopping",
      local_favorite: true,
      google_rating: 4.8,
      google_rating_count: 300,
    });
    expect(kinds(shop)).toContain("top_rated");
    expect(kinds(shop)).not.toContain("local_favorite");
  });

  it("knows which categories are destinations", () => {
    expect(isDestinationCategory("restaurant")).toBe(true);
    expect(isDestinationCategory("trail")).toBe(true);
    expect(isDestinationCategory("shopping")).toBe(false);
    expect(isDestinationCategory("hardware")).toBe(false);
    expect(isDestinationCategory("not-a-category")).toBe(false);
  });
});

describe("placeRowMark — at most one mark per row", () => {
  it("leads with a verified deal figure, then Field Notes", () => {
    expect(
      placeRowMark(
        place({ category: "bar", deal_hook: "25% OFF", field_notes: true, local_favorite: true }),
      ),
    ).toEqual({ kind: "deal", label: "25% OFF", tone: "deal" });
    expect(
      placeRowMark(place({ category: "bar", field_notes: true, local_favorite: true })),
    ).toEqual({ kind: "field_notes", label: "Field notes", tone: "notes" });
  });

  it("never repeats the status, distance or rating the row already prints", () => {
    const mark = placeRowMark(
      place({
        category: "coffee",
        open_status: OPEN,
        open_confidence: "verified",
        distance_m: 68,
        google_rating: 4.8,
        google_rating_count: 400,
        feature_score: 0,
      }),
    );
    expect(mark).toBeNull();
  });

  it("uses the first editorial reason, in neutral ink", () => {
    expect(placeRowMark(place({ category: "restaurant", local_favorite: true }))).toEqual({
      kind: "local_favorite",
      label: "Local favorite",
      tone: "neutral",
    });
    expect(
      placeRowMark(place({ category: "park", tags: ["dog-friendly"], local_favorite: true }))?.label,
    ).toBe("Dog-friendly");
  });

  it("does not mark an errand with a landmark the street already locates", () => {
    expect(placeRowMark(place({ category: "coffee", geom: CARROLL_CREEK }))?.label).toBe(
      "Near Carroll Creek",
    );
    expect(placeRowMark(place({ category: "services", geom: CARROLL_CREEK }))).toBeNull();
  });
});

describe("streetLine", () => {
  it.each([
    ["118 S Market St", "118 S Market St"],
    ["49 E Patrick St, Frederick, MD 21701", "49 E Patrick St"],
    ["Barbara Fritchie House, 154 W Patrick St, Frederick, MD 21701", "154 W Patrick St"],
    ["CFWC+8P, 7628 Coblentz Rd, Middletown, MD 21769", "7628 Coblentz Rd"],
    ["10-B N East St", "10-B N East St"],
    ["402 5th Ave, Brunswick, MD 21716", "402 5th Ave"],
    ["2nd Ave, Brunswick, MD 21716", "2nd Ave"],
  ])("keeps the street of %s", (address, street) => {
    expect(streetLine(address)).toBe(street);
  });

  it.each([
    "Frederick",
    "Frederick, MD 21701",
    "CH7V+3PR",
    "25, Brunswick, MD 21716",
    "Dancingspine Chiropractic in Frederick",
    "",
    null,
    undefined,
  ])("prints nothing for %s", (address) => {
    expect(streetLine(address)).toBeNull();
  });
});
