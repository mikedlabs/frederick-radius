import { describe, expect, it } from "vitest";
import BUSINESS_INFO_RAW from "@/data/business-info.json" with { type: "json" };
import {
  businessInfoRowEvidenceTimestamp,
  buildSourceArtifactEvidence,
  bundledSourceArtifactEvidence,
} from "./source-artifact-evidence";

describe("bundled source artifact evidence", () => {
  it("uses commerce verification only when editorial evidence is absent", () => {
    expect(
      businessInfoRowEvidenceTimestamp({
        source: { fetchedAt: "2026-07-20T00:00:00.000Z" },
        commerce_source: { checkedAt: "2026-07-28T00:00:00.000Z" },
      }),
    ).toBe("2026-07-20T00:00:00.000Z");
    expect(
      businessInfoRowEvidenceTimestamp({
        commerce_source: { checkedAt: "2026-07-28T00:00:00.000Z" },
      }),
    ).toBe("2026-07-28T00:00:00.000Z");
    expect(businessInfoRowEvidenceTimestamp({})).toBeUndefined();
  });

  it("uses the oldest row timestamp so one fresh row cannot launder a stale batch", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "venue_event_extraction",
          timestamps: [
            "2026-07-26T12:00:00.000Z",
            "2026-07-28T09:00:00.000Z",
          ],
          recordCount: 2,
        },
      ]),
    ).toEqual([
      {
        sourceKey: "venue_event_extraction",
        kind: "artifact",
        attemptedAt: "2026-07-26T12:00:00.000Z",
        outcome: "success",
        succeededAt: "2026-07-26T12:00:00.000Z",
        publishedAt: "2026-07-26T12:00:00.000Z",
        recordCount: 2,
      },
    ]);
  });

  it("emits no evidence when any published row lacks a valid timestamp", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "municipal_civic_extraction",
          timestamps: [null, "", "unknown"],
          recordCount: 3,
        },
      ]),
    ).toEqual([]);
  });

  it("emits no evidence when row timestamp coverage is incomplete", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "business_info_extraction",
          timestamps: ["2026-07-22T00:00:00.000Z"],
          recordCount: 2,
        },
      ]),
    ).toEqual([]);
  });

  it("allows one timestamp to cover an atomic artifact", () => {
    expect(
      buildSourceArtifactEvidence([
        {
          sourceKey: "transit_gtfs",
          timestamps: ["2026-07-22"],
          recordCount: 17,
          timestampCoverage: "artifact",
        },
      ])[0],
    ).toMatchObject({
      publishedAt: "2026-07-22T00:00:00.000Z",
      recordCount: 17,
    });
  });

  it("recognizes every workflow artifact currently bundled for monitoring", () => {
    const evidence = bundledSourceArtifactEvidence();

    expect(evidence.map((item) => item.sourceKey).sort()).toEqual([
      "business_info_extraction",
      "municipal_civic_extraction",
      "transit_gtfs",
      "venue_event_extraction",
    ]);
    expect(
      evidence.find((item) => item.sourceKey === "business_info_extraction"),
    ).toMatchObject({
      kind: "artifact",
      recordCount: Object.keys(BUSINESS_INFO_RAW).length,
    });
    expect(
      evidence.every(
        (item) =>
          item.kind === "artifact"
          && item.publishedAt
          && Number.isFinite(Date.parse(item.publishedAt))
          && typeof item.recordCount === "number"
          && item.recordCount >= 0,
      ),
    ).toBe(true);
  });
});
