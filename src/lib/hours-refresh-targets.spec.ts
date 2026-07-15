import { describe, expect, it } from "vitest";
import {
  hoursRefreshCycleDay,
  selectHoursRefreshTargets,
} from "@/lib/hours-refresh-targets";

describe("hours refresh target selection", () => {
  it("includes Google-backed discovered records instead of filtering by source", () => {
    const slug = "discovered-cafe";
    const day = hoursRefreshCycleDay(slug);
    const places = [
      { slug, google_place_id: "google-1", source: "discovered" },
      { slug: "missing-google-id", source: "partner" },
    ];

    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[0]]);
  });

  it("is deterministic and respects the paid-call cap", () => {
    const all = Array.from({ length: 100 }, (_, index) => ({
      slug: `place-${index}`,
      google_place_id: `google-${index}`,
    }));
    const day = hoursRefreshCycleDay("place-1");
    const first = selectHoursRefreshTargets(all, day, 3);
    const second = selectHoursRefreshTargets([...all].reverse(), day, 3);

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("pays for a duplicated Google identity only once", () => {
    const places = [
      { slug: "z-alias", google_place_id: "same-google-id" },
      { slug: "a-canonical", google_place_id: "same-google-id" },
    ];
    const day = hoursRefreshCycleDay("a-canonical");
    expect(selectHoursRefreshTargets(places, day, 10)).toEqual([places[1]]);
  });
});
