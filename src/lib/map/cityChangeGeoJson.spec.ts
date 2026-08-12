import { describe, expect, it } from "vitest";
import type { CityFrederickChangeRecord } from "@/lib/integrations/cityFrederickChanges";
import { cityChangeOverlayGeoJson } from "./cityChangeGeoJson";

const base: CityFrederickChangeRecord = {
  id: "cof-review-test",
  sourceId: "cof_development_review",
  sourceRecordId: "test",
  kind: "development_review",
  name: "Frederick Gateway",
  referenceId: "PC24-984ZMA",
  recordType: "Zoning Map Amendment",
  reviewBody: "City Council",
  summary: "A zoning-map amendment is under review.",
  sourceStatus: "Pending",
  statusLabel: "Development review · Pending",
  lifecycle: "application_pending",
  constructionStatus: "not_established",
  sourceUpdatedAt: "2026-08-01T12:00:00.000Z",
  contentHash: `sha256:${"a".repeat(64)}`,
  geometry: { type: "Point", coordinates: [-77.3691, 39.4012] },
};

describe("cityChangeOverlayGeoJson", () => {
  it("keeps source lifecycle, freshness, and stable version keys on every feature", () => {
    const collection = cityChangeOverlayGeoJson([base], {
      checkedAt: "2026-08-11T12:00:00.000Z",
      sourceStatus: "current",
    });

    expect(collection.features[0]).toMatchObject({
      geometry: base.geometry,
      properties: {
        id: "cof-review-test",
        record_kind: "development_review",
        popup_label: "City development review",
        status_label: "Development review · Pending",
        lifecycle: "application_pending",
        construction_status: "not_established",
        reference_id: "PC24-984ZMA",
        source_record_id: "test",
        source_id: "cof_development_review",
        source_status: "current",
        checked_at: "2026-08-11T12:00:00.000Z",
        source_updated_at: "2026-08-01T12:00:00.000Z",
        content_hash: `sha256:${"a".repeat(64)}`,
        caveat: expect.stringContaining("does not by itself establish approval"),
      },
    });
  });

  it("labels last-good records stale without changing their lifecycle", () => {
    const properties = cityChangeOverlayGeoJson([base], {
      checkedAt: "2026-08-09T12:00:00.000Z",
      sourceStatus: "stale",
    }).features[0].properties;

    expect(properties).toMatchObject({
      lifecycle: "application_pending",
      source_status: "stale",
      checked_at: "2026-08-09T12:00:00.000Z",
    });
  });
});
