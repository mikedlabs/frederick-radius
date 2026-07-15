import { describe, expect, it } from "vitest";
import { sourceBadgeMeta } from "./SourceBadge";

describe("sourceBadgeMeta", () => {
  it("recognizes both county-GIS source spellings as official", () => {
    for (const source of ["arcgis", "fc-gis"] as const) {
      expect(sourceBadgeMeta({ source, is_verified: true, google_verified: true })?.tier).toBe(
        "official",
      );
    }
  });

  it("does not turn a Google source check into owner verification", () => {
    const meta = sourceBadgeMeta({
      source: "discovered",
      is_verified: true,
      google_verified: true,
    });
    expect(meta?.label).toBe("Checked at source");
    expect(meta?.explanation).toMatch(/not owner verification/i);
  });

  it("describes seed records as reviewed without claiming every fact was hand-vetted", () => {
    expect(sourceBadgeMeta({ source: "seed", is_verified: true, google_verified: true })?.label).toBe(
      "Radius reviewed",
    );
  });
});
