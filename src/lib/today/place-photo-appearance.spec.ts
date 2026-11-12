import { describe, expect, it } from "vitest";
import { placeCardPhotoPlan, type PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { TODAY_PHOTO_APPEARANCE_REVIEWS, hasTodayPhotoAppearanceReview, todayAppearancePhotoPlan, type TodayPhotoAppearanceReview } from "./place-photo-appearance";

const src = "/images/offline-current-store.jpg";
const asOf = new Date("2026-10-26T16:00:00.000Z");
const fixtureReview: TodayPhotoAppearanceReview = {
  slug: "offline-store", src, appearance: "current", reviewedOn: "2026-10-26",
  validUntil: "2026-10-31",
  evidence: "Offline approval fixture, not evidence for a real business.",
};
const fixturePlan: PlaceCardPhotoPlan = { key: "offline-plan", sources: [
  { kind: "owned", src, alt: "An offline storefront." },
  { kind: "owned", src: "/images/unreviewed-fallback.jpg", alt: "An unreviewed alternative." },
] };

describe("Today exact current-appearance photo policy", () => {
  it("has no production approvals and does not promote licensed or owned identity evidence", () => {
    expect(TODAY_PHOTO_APPEARANCE_REVIEWS).toEqual([]);
    for (const slug of ["sabor-de-cuba-restaurant-frederick", "brewers-alley-frederick", "zoes-chocolate-company"]) {
      const identityPlan = placeCardPhotoPlan({ slug }, 360);
      expect(identityPlan.sources.length).toBeGreaterThan(0);
      expect(todayAppearancePhotoPlan(slug, identityPlan).sources).toEqual([]);
      // The restriction is local to Today; archival identity/credit stays intact.
      expect(placeCardPhotoPlan({ slug }, 360)).toEqual(identityPlan);
    }
  });

  it("allows only an explicitly reviewed exact slug and source without approving its fallback", () => {
    const result = todayAppearancePhotoPlan("offline-store", fixturePlan, [fixtureReview], asOf);
    expect(result.sources).toEqual([fixturePlan.sources[0]]);
    expect(result.sources[0]).toBe(fixturePlan.sources[0]);
    expect(todayAppearancePhotoPlan("another-store", fixturePlan, [fixtureReview], asOf).sources).toEqual([]);
    expect(hasTodayPhotoAppearanceReview("offline-store", "/images/replacement.jpg", [fixtureReview], asOf)).toBe(false);
  });

  it("does not infer an approval from an incomplete, unknown or date-only review", () => {
    for (const patch of [{ appearance: "unknown" }, { reviewedOn: "" }, { reviewedOn: "not-a-date" }, { validUntil: "" }, { evidence: " " }]) {
      const review = { ...fixtureReview, ...patch } as TodayPhotoAppearanceReview;
      expect(todayAppearancePhotoPlan("offline-store", fixturePlan, [review], asOf).sources).toEqual([]);
    }
    expect(hasTodayPhotoAppearanceReview("offline-store", null, [fixtureReview], asOf)).toBe(false);
  });

  it("rejects normalized invalid dates, future reviews, expired or reversed review windows", () => {
    for (const patch of [{ reviewedOn: "2026-02-30" }, { reviewedOn: "2026-10-27" },
      { validUntil: "2026-10-25" }, { validUntil: "2026-02-30" }, { reviewedOn: "2026-11-01", validUntil: "2026-10-31" }]) {
      expect(todayAppearancePhotoPlan("offline-store", fixturePlan, [{ ...fixtureReview, ...patch }], asOf).sources).toEqual([]);
    }
    expect(todayAppearancePhotoPlan("offline-store", fixturePlan, [fixtureReview], new Date("invalid")).sources).toEqual([]);
  });

  it("uses actual New York day boundaries and each review's explicit deadline", () => {
    const review = { ...fixtureReview, validUntil: "2026-10-26" };
    expect(hasTodayPhotoAppearanceReview("offline-store", src, [review], new Date("2026-10-27T03:59:59.999Z"))).toBe(true);
    expect(hasTodayPhotoAppearanceReview("offline-store", src, [review], new Date("2026-10-27T04:00:00.000Z"))).toBe(false);
    expect(hasTodayPhotoAppearanceReview("offline-store", src, [review], new Date("2026-10-26T03:59:59.999Z"))).toBe(false);
  });

  it("also requires a separate exact appearance review for an attributed provider source", () => {
    const provider = { kind: "google" as const, src: "/api/place-photo?name=places%2Foffline%2Fphotos%2Fone&w=360&fallback=signal", alt: "Offline place",
      attribution: { photo_name: "places/offline/photos/one", authors: [] } };
    const plan = { key: "offline-provider-plan", sources: [provider] };
    expect(todayAppearancePhotoPlan("offline-store", plan, [fixtureReview], asOf).sources).toEqual([]);
    expect(todayAppearancePhotoPlan("offline-store", plan, [{ ...fixtureReview, src: provider.src }], asOf).sources).toEqual([provider]);
  });
});
