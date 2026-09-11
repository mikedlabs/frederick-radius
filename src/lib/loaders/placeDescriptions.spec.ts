import { describe, expect, it } from "vitest";
import {
  approvedPlaceDescription,
  placeDescriptionEntries,
} from "./placeDescriptions";

describe("approved place descriptions", () => {
  it("publishes only source-checked approvals with a review record", () => {
    const entries = Object.entries(placeDescriptionEntries());
    const approved = entries.filter(([, entry]) => entry.status === "approved");

    expect(approved.length).toBeGreaterThan(0);
    for (const [slug, entry] of approved) {
      expect(entry.reviewed_at).toBeTruthy();
      expect(entry.reviewer_note?.trim()).toBeTruthy();
      expect(entry.source.kind === "radius_editorial" || entry.source.url?.startsWith("https://")).toBe(true);
      expect(approvedPlaceDescription(slug, slug)).not.toBeNull();
    }
  });

  it("does not publish unknown records", () => {
    expect(approvedPlaceDescription("not-a-real-place", "Not a real place")).toBeNull();
  });
});
