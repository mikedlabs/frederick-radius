import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSeeClickFixSnapshot,
  MINIMUM_GENERAL_CELL_SIZE,
  MINIMUM_TREND_DAYS,
} from "./seeclickfix";

const NOW = new Date("2026-07-26T16:00:00.000Z");

function feature(
  id: number,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [-77.4105, 39.4143],
    },
    properties: {
      external_id: String(id),
      summary: "Raw summary must never cross the aggregate boundary",
      description: "Call 301-555-0100 about 123 Market St",
      address: "123 Market St Frederick, Maryland",
      status: "acknowledged",
      status_raw: "Acknowledged",
      category: "Roadway General Request",
      reported_at: `2026-07-${String(1 + (id % 3)).padStart(2, "0")}T12:00:00.000Z`,
      url: `https://seeclickfix.com/issues/${id}`,
      source: "seeclickfix",
      ...over,
    },
  };
}

function collection(features: unknown[]): Record<string, unknown> {
  return { type: "FeatureCollection", features };
}

describe("analyzeSeeClickFixSnapshot", () => {
  it("reads the current normalized file as one dated, countywide snapshot", async () => {
    const raw = JSON.parse(
      await readFile(
        join(process.cwd(), "data", "clean", "seeclickfix.geojson"),
        "utf8",
      ),
    ) as unknown;
    const result = analyzeSeeClickFixSnapshot(raw, { now: NOW });

    expect(result.quality).toMatchObject({
      grain: "one public service report",
      inputRecords: 20,
      acceptedRecords: 20,
      rejectedRecords: 0,
      duplicateRecords: 0,
      distinctDays: 2,
      minimumCellSize: MINIMUM_GENERAL_CELL_SIZE,
      minimumCellMet: true,
      snapshotOnly: true,
    });
    expect(result.sourceHealth[0]).toMatchObject({
      status: "stale",
      acceptedRecords: 20,
      lastObservedAt: "2026-07-22T19:37:10.000Z",
    });
    expect(result.sourceHealth[0].window).toMatchObject({
      label: "Jul 21–22, 2026",
      kind: "snapshot",
    });

    // The 12/20 roadway split is not public: its complementary cell is only 8.
    expect(result.facts.map((fact) => fact.metricId)).toEqual([
      "fixit.report-count",
    ]);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      topic: "public-services",
      scope: { type: "county", id: "frederick-county-md" },
      comparison: {
        kind: "snapshot-count",
        current: 20,
        unit: "count",
      },
      window: { kind: "snapshot", label: "Jul 21–22, 2026" },
      publicationStatus: "published",
    });
    expect(result.signals[0].title).toBe(
      "The saved file contains 20 recent service reports",
    );
    expect(result.signals[0].statement).toContain("Jul 21–22, 2026");
    expect(result.signals[0].whyItMatters).toContain(
      "does not measure every request from those dates",
    );
    expect(result.signals[0].whyItMatters).toContain("compare neighborhoods");
  });

  it("never lets a caller lower the general public cell floor", () => {
    const result = analyzeSeeClickFixSnapshot(
      collection(Array.from({ length: 10 }, (_, index) => feature(index + 1))),
      { now: NOW, minimumCellSize: 1 },
    );

    expect(result.quality.minimumCellSize).toBe(MINIMUM_GENERAL_CELL_SIZE);
    expect(result.quality.minimumCellMet).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.signals).toEqual([]);
    expect(result.sourceHealth[0].status).toBe("insufficient");
  });

  it("requires the complementary cell before publishing a composition", () => {
    const roadway = Array.from({ length: 22 }, (_, index) => feature(index + 1));
    const other = Array.from({ length: 11 }, (_, index) =>
      feature(index + 101, { category: "Water Issue", status: "closed" }),
    );
    const result = analyzeSeeClickFixSnapshot(collection([...roadway, ...other]), {
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(result.facts.map((fact) => fact.metricId)).toEqual([
      "fixit.report-count",
      "fixit.roadway-report-count",
      "fixit.acknowledged-report-count",
    ]);
    expect(result.signals.map((signal) => signal.method.ruleId)).toEqual([
      "fixit-snapshot-volume",
      "fixit-roadway-composition",
    ]);
    expect(result.signals[1].comparison).toEqual({
      kind: "composition",
      label: "Roadway reports out of all accepted reports",
      current: 22,
      baseline: 33,
      unit: "count",
    });
  });

  it("deduplicates IDs and reports categorical validation failures", () => {
    const features = Array.from({ length: 11 }, (_, index) => feature(index + 1));
    features.push(feature(1));
    features.push(feature(100, { source: "somewhere-else" }));
    features.push(feature(101, { reported_at: "not-a-date" }));
    features.push(feature(102, { category: "" }));
    features.push({
      type: "Feature",
      properties: { external_id: "missing-everything-else" },
    });

    const result = analyzeSeeClickFixSnapshot(collection(features), {
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(result.quality).toMatchObject({
      inputRecords: 16,
      acceptedRecords: 11,
      rejectedRecords: 5,
      duplicateRecords: 1,
      rejectionCounts: {
        "duplicate-id": 1,
        "wrong-source": 2,
        "invalid-timestamp": 1,
        "missing-category": 1,
      },
    });
  });

  it("does not retain raw text, addresses, URLs, or geometry", () => {
    const result = analyzeSeeClickFixSnapshot(
      collection(
        Array.from({ length: 11 }, (_, index) =>
          feature(index + 1, {
            category:
              "Roadway 123 Market St 301-555-0100 -77.4105, 39.4143",
          }),
        ),
      ),
      { now: new Date("2026-07-04T12:00:00.000Z") },
    );
    const output = JSON.stringify(result);

    expect(output).not.toContain("123 Market St");
    expect(output).not.toContain("301-555-0100");
    expect(output).not.toContain("-77.4105");
    expect(output).not.toContain("Raw summary");
    expect(output).not.toContain("seeclickfix.com/issues/");
    expect(output).not.toContain('"geometry"');
    expect(output).not.toContain('"address"');
    expect(output).not.toContain('"description"');
  });

  it("keeps this analyzer snapshot-only even when many dates are supplied", () => {
    const features = Array.from({ length: MINIMUM_TREND_DAYS }, (_, index) =>
      feature(index + 1, {
        category: "Water Issue",
        reported_at: `2026-06-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );
    const result = analyzeSeeClickFixSnapshot(collection(features), {
      now: new Date("2026-07-01T12:00:00.000Z"),
    });

    expect(result.quality.distinctDays).toBe(MINIMUM_TREND_DAYS);
    expect(result.quality.snapshotOnly).toBe(true);
    expect(result.signals.every((signal) => signal.window.kind === "snapshot")).toBe(
      true,
    );
    expect(result.quality.caveats.join(" ")).toContain(
      "Trend rules remain disabled",
    );
  });

  it("withholds old snapshots instead of leaving a stale finding in public", () => {
    const result = analyzeSeeClickFixSnapshot(
      collection(Array.from({ length: 11 }, (_, index) => feature(index + 1))),
      { now: new Date("2026-09-01T12:00:00.000Z") },
    );

    expect(result.sourceHealth[0].status).toBe("stale");
    expect(result.signals).toEqual([]);
  });

  it("returns an invalid health envelope for malformed input", () => {
    const result = analyzeSeeClickFixSnapshot({ features: [] }, { now: NOW });

    expect(result.signals).toEqual([]);
    expect(result.facts).toEqual([]);
    expect(result.sourceHealth[0].status).toBe("invalid");
    expect(result.quality.rejectionCounts).toEqual({
      "invalid-collection": 1,
    });
  });
});
