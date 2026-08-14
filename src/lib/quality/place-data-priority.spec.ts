import { describe, expect, it } from "vitest";
import type { PlaceDataCoveragePlace } from "@/lib/quality/place-data-priority";
import {
  comparePlaceDataPriority,
  placeDataGapReason,
  placeDataPriorityLabel,
  prioritizePlaceDataGaps,
} from "@/lib/quality/place-data-priority";

const NOW = new Date("2026-08-14T12:00:00Z");

function place(
  overrides: Partial<PlaceDataCoveragePlace> = {},
): PlaceDataCoveragePlace {
  return {
    slug: "sample-place",
    name: "Sample Place",
    category: "coffee",
    source: "manual",
    feature_score: 5,
    local_favorite: false,
    short_blurb:
      "This downtown coffee shop serves espresso drinks and baked goods.",
    hours: { mon: [{ open: "08:00", close: "17:00" }] },
    hours_verified: true,
    hours_updated_at: "2026-08-13T12:00:00Z",
    google_photo_url: "/api/place-photo?name=places%2Ftest%2Fphotos%2Fone",
    ...overrides,
  };
}

describe("place data priority", () => {
  it("keeps an explicit bounded campaign ahead of the general queue", () => {
    const ordinary = place({ slug: "ordinary", local_favorite: true });
    const preferred = place({
      slug: "preferred",
      local_favorite: false,
      feature_score: 1,
    });

    expect(
      comparePlaceDataPriority(preferred, ordinary, {
        preferredSlugs: new Set(["preferred"]),
      }),
    ).toBeLessThan(0);
  });

  it("puts visitor destinations ahead of non-destination services", () => {
    const destination = place({
      slug: "destination",
      category: "museum",
      feature_score: 6,
    });
    const service = place({
      slug: "service",
      category: "wellness",
      feature_score: 10,
      local_favorite: true,
    });

    expect(comparePlaceDataPriority(destination, service)).toBeLessThan(0);
    expect(placeDataPriorityLabel(destination)).toBe("Destination");
  });

  it("orders comparable destinations by curation and review evidence", () => {
    const favorite = place({ slug: "favorite", local_favorite: true });
    const reviewed = place({
      slug: "reviewed",
      google_rating: 4.9,
      google_rating_count: 2_000,
    });

    expect(comparePlaceDataPriority(favorite, reviewed)).toBeLessThan(0);
    expect(placeDataPriorityLabel(favorite)).toBe(
      "Local-favorite destination",
    );
  });

  it("does not let a perfect one-review rating outrank broad evidence", () => {
    const oneReview = place({
      slug: "one-review",
      google_rating: 5,
      google_rating_count: 1,
    });
    const broadlyReviewed = place({
      slug: "broadly-reviewed",
      google_rating: 4.9,
      google_rating_count: 2_000,
    });

    expect(
      comparePlaceDataPriority(broadlyReviewed, oneReview),
    ).toBeLessThan(0);
  });

  it("uses the strict release definitions for all three content gaps", () => {
    const complete = place({ slug: "complete", name: "Complete Place" });
    const missing = place({
      slug: "missing",
      name: "Missing Place",
      local_favorite: true,
      short_blurb: "",
      hours: undefined,
      hours_verified: false,
      hours_updated_at: undefined,
      google_photo_url: undefined,
    });

    expect(
      prioritizePlaceDataGaps([complete, missing], { now: NOW }),
    ).toEqual([
      {
        place: missing,
        gaps: ["copy", "hours", "photo"],
        reasons: {
          copy: "collect_first_party_copy",
          hours: "collect_official_hours",
          photo: "resolve_photo_identity",
        },
        priorityLabel: "Local-favorite destination",
      },
    ]);
  });

  it("treats stale hours as a gap instead of a current schedule", () => {
    const stale = place({
      slug: "stale",
      hours_updated_at: "2026-08-01T12:00:00Z",
    });

    expect(prioritizePlaceDataGaps([stale], { now: NOW })[0]?.gaps).toEqual([
      "hours",
    ]);
  });

  it("routes source-backed copy to editorial review without publishing it", () => {
    const candidate = place({ slug: "candidate" });

    expect(
      placeDataGapReason(
        "copy",
        candidate,
        { descriptions: { candidate: { status: "candidate" } } },
        NOW,
      ),
    ).toBe("approve_source_backed_copy");
  });

  it("separates a current provider schedule from public visitability", () => {
    const allDay = [
      "Monday: Open 24 hours",
      "Tuesday: Open 24 hours",
      "Wednesday: Open 24 hours",
      "Thursday: Open 24 hours",
      "Friday: Open 24 hours",
      "Saturday: Open 24 hours",
      "Sunday: Open 24 hours",
    ];
    const candidate = place({
      slug: "unreviewed-all-day",
      google_place_id: "ChIJ-unreviewed",
      hours: undefined,
      hours_verified: false,
    });

    expect(
      placeDataGapReason(
        "hours",
        candidate,
        {
          hoursRefresh: {
            "unreviewed-all-day": {
              place_id: "ChIJ-unreviewed",
              weekday_hours: allDay,
              refreshed_at: "2026-08-13T12:00:00Z",
            },
          },
        },
        NOW,
      ),
    ).toBe("verify_public_visitability");
  });

  it("routes a withheld manual hours correction back to source review", () => {
    const candidate = place({
      slug: "manual-hours",
      google_place_id: "ChIJ-manual-hours",
      hours: undefined,
      hours_verified: false,
    });

    expect(
      placeDataGapReason(
        "hours",
        candidate,
        { manualHoursSlugs: new Set(["manual-hours"]) },
        NOW,
      ),
    ).toBe("review_manual_hours_override");
  });

  it("keeps intentional photo suppression distinct from missing metadata", () => {
    const suppressed = place({
      slug: "shared-photo",
      google_place_id: "ChIJ-shared",
      google_photo_url: undefined,
    });
    const unattributed = place({
      slug: "unattributed",
      google_place_id: "ChIJ-unattributed",
      google_photo_url: undefined,
    });

    expect(
      placeDataGapReason(
        "photo",
        suppressed,
        { photoSuppressedSlugs: new Set(["shared-photo"]) },
        NOW,
      ),
    ).toBe("respect_photo_suppression");
    expect(
      placeDataGapReason(
        "photo",
        unattributed,
        {
          photoEnrichment: {
            unattributed: {
              google_place_id: "ChIJ-unattributed",
              photo_names: ["places/ChIJ-unattributed/photos/one"],
              photo_attributions: [],
            },
          },
        },
        NOW,
      ),
    ).toBe("backfill_photo_attribution");
  });
});
