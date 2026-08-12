import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { applyLivePlaceEvidence } from "@/lib/live-place-evidence";

const NOW = new Date("2026-08-11T16:00:00Z");
const WEEK = [
  "Monday: 8:00 AM - 6:00 PM",
  "Tuesday: 8:00 AM - 6:00 PM",
  "Wednesday: 8:00 AM - 6:00 PM",
  "Thursday: 8:00 AM - 6:00 PM",
  "Friday: 8:00 AM - 6:00 PM",
  "Saturday: 9:00 AM - 4:00 PM",
  "Sunday: Closed",
];

function place(overrides: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    id: "place-1",
    slug: "test-cafe",
    name: "Test Cafe",
    category: "coffee",
    municipality: "frederick",
    city: "Frederick",
    state: "MD",
    geom: { lng: -77.41, lat: 39.41 },
    source: "google_places",
    google_place_id: "ChIJ-test",
    is_operational: "operational",
    open_status: { state: "unknown" },
    ...overrides,
  } as PlaceCardData;
}

describe("applyLivePlaceEvidence", () => {
  it("applies identity-matched fresh hours and recomputes current status", () => {
    const result = applyLivePlaceEvidence(
      place(),
      {
        slug: "test-cafe",
        placeId: "ChIJ-test",
        weekdayHours: WEEK,
        businessStatus: "OPERATIONAL",
        observedAt: "2026-08-11T12:00:00Z",
      },
      NOW,
    );

    expect(result.hours_verified).toBe(true);
    expect(result.hours_updated_at).toBe("2026-08-11T12:00:00Z");
    expect(result.hours_source).toBe("google_places");
    expect(result.open_status.state).toBe("open");
  });

  it("ignores stale evidence and a mismatched provider identity", () => {
    const base = place();
    expect(
      applyLivePlaceEvidence(
        base,
        {
          slug: "test-cafe",
          placeId: "ChIJ-other",
          weekdayHours: WEEK,
          businessStatus: "OPERATIONAL",
          observedAt: "2026-08-11T12:00:00Z",
        },
        NOW,
      ),
    ).toBe(base);
    expect(
      applyLivePlaceEvidence(
        base,
        {
          slug: "test-cafe",
          placeId: "ChIJ-test",
          weekdayHours: WEEK,
          businessStatus: "OPERATIONAL",
          observedAt: "2026-07-01T12:00:00Z",
        },
        NOW,
      ),
    ).toBe(base);
  });

  it("does not replace a curated hours correction", () => {
    const manual = place({
      hours_source: "manual_override",
      hours_verified: true,
      hours_updated_at: "2026-08-10T12:00:00Z",
      hours: { mon: [{ open: "10:00", close: "14:00" }] },
    });
    const result = applyLivePlaceEvidence(
      manual,
      {
        slug: "test-cafe",
        placeId: "ChIJ-test",
        weekdayHours: WEEK,
        businessStatus: "OPERATIONAL",
        observedAt: "2026-08-11T12:00:00Z",
      },
      NOW,
    );

    expect(result.hours).toEqual(manual.hours);
    expect(result.hours_source).toBe("manual_override");
  });

  it("removes open claims when current provider evidence says closed", () => {
    const result = applyLivePlaceEvidence(
      place({
        hours_verified: true,
        hours: { tue: [{ open: "08:00", close: "18:00" }] },
        open_status: { state: "open", closesAt: "18:00", closingSoon: false },
      }),
      {
        slug: "test-cafe",
        placeId: "ChIJ-test",
        weekdayHours: WEEK,
        businessStatus: "CLOSED_TEMPORARILY",
        observedAt: "2026-08-11T12:00:00Z",
      },
      NOW,
    );

    expect(result.is_operational).toBe("closed_temporarily");
    expect(result.hours_verified).toBe(false);
    expect(result.open_status.state).toBe("unknown");
  });
});
