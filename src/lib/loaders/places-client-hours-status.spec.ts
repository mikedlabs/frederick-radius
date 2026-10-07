import { describe, expect, it } from "vitest";
import { clientPlaceBySlug, clientPlaces } from "@/lib/loaders/places-client";
import { formatHoursLine } from "@/lib/hours";

describe("client place hours wording", () => {
  it("says hours are not confirmed when a schedule is on file but cannot be asserted", () => {
    const place = clientPlaceBySlug("home-depot-west-frederick");
    expect(place?.open_status).toEqual({ state: "unknown", reason: "stale" });
    expect(formatHoursLine(place!.open_status!)).toBe("Hours not confirmed");
  });

  it("keeps hours not posted for a place with no schedule on file", () => {
    const place = clientPlaceBySlug("islamic-society-of-frederick");
    expect(place?.open_status).toEqual({ state: "unknown" });
    expect(formatHoursLine(place!.open_status!)).toBe("Hours not posted");
  });

  it("never asserts open or closed from the slim set", () => {
    for (const place of clientPlaces()) {
      if (place.open_status?.state === "unknown") continue;
      expect(place.hours_verified).toBe(true);
    }
  });
});
