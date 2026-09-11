import { describe, expect, it } from "vitest";
import trackedArtifact from "./artifacts/seeclickfix-aggregate.json";
import {
  analyzeSeeClickFixAggregateArtifact,
  type SeeClickFixAggregateArtifact,
} from "./artifact";
import { serializePublicCivicSignalsPayload } from "./serialize";

const NOW = new Date("2026-07-26T16:00:00.000Z");

function approvedArtifact(): SeeClickFixAggregateArtifact {
  const artifact = structuredClone(
    trackedArtifact,
  ) as unknown as SeeClickFixAggregateArtifact;
  artifact.publication.approved = true;
  artifact.publication.reviewedAt = "2026-07-25T12:00:00.000Z";
  artifact.publication.approvalBasis =
    "Written source-reuse approval recorded by the project owner.";
  return artifact as SeeClickFixAggregateArtifact;
}

describe("tracked SeeClickFix aggregate artifact", () => {
  it("contains no raw-record or location-level fields", () => {
    const output = JSON.stringify(trackedArtifact);
    const forbiddenKeys = [
      "features",
      "properties",
      "external_id",
      "issue_id",
      "summary",
      "description",
      "address",
      "geometry",
      "coordinates",
      "latitude",
      "longitude",
      "lat",
      "lng",
    ];

    for (const key of forbiddenKeys) {
      expect(output).not.toContain(`"${key}"`);
    }
  });

  it("keeps the tracked artifact pending and redacts its values publicly", () => {
    const analysis = analyzeSeeClickFixAggregateArtifact(trackedArtifact, {
      now: NOW,
    });
    const payload = serializePublicCivicSignalsPayload(analysis, { now: NOW });

    expect(analysis.signals).toEqual([]);
    expect(analysis.facts).toEqual([]);
    expect(payload.signals).toEqual([]);
    expect(payload.sourceHealth[0]).toMatchObject({
      status: "review-required",
      acceptedRecords: 0,
      lastObservedAt: null,
      window: null,
    });
    expect(payload.quality.acceptedRecords).toBe(0);
    expect(JSON.stringify(payload)).not.toContain('"current":20');
  });

  it("requires both approval time and approval basis before publishing", () => {
    const missingBasis = structuredClone(
      trackedArtifact,
    ) as unknown as SeeClickFixAggregateArtifact;
    missingBasis.publication.approved = true;
    missingBasis.publication.reviewedAt = "2026-07-25T12:00:00.000Z";

    const analysis = analyzeSeeClickFixAggregateArtifact(missingBasis, {
      now: NOW,
    });

    expect(analysis.signals).toEqual([]);
    expect(analysis.sourceHealth[0].status).toBe("invalid");
  });

  it("can publish a dated total only after the approval gate passes", () => {
    const analysis = analyzeSeeClickFixAggregateArtifact(approvedArtifact(), {
      now: NOW,
    });

    expect(analysis.signals).toHaveLength(1);
    expect(analysis.facts).toHaveLength(1);
    expect(analysis.signals[0]).toMatchObject({
      publicationStatus: "published",
      comparison: {
        kind: "snapshot-count",
        current: 20,
        unit: "count",
      },
      method: {
        ruleId: "fixit-aggregate-snapshot-volume",
      },
    });
    expect(analysis.sourceHealth[0].status).toBe("stale");
  });

  it("withholds an approved artifact after its 30-day publication window", () => {
    const analysis = analyzeSeeClickFixAggregateArtifact(approvedArtifact(), {
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(analysis.signals).toEqual([]);
    expect(analysis.sourceHealth[0].status).toBe("stale");
  });

  it("rejects inconsistent aggregate counts", () => {
    const malformed = approvedArtifact();
    malformed.aggregate.inputRecords = 19;

    const analysis = analyzeSeeClickFixAggregateArtifact(malformed, {
      now: NOW,
    });

    expect(analysis.signals).toEqual([]);
    expect(analysis.sourceHealth[0].status).toBe("invalid");
  });

  it("rejects an otherwise valid artifact if raw-record fields are added", () => {
    const artifact = approvedArtifact() as SeeClickFixAggregateArtifact & {
      raw?: unknown;
    };
    artifact.raw = {
      features: [
        {
          properties: {
            address: "123 Market St",
          },
        },
      ],
    };

    const analysis = analyzeSeeClickFixAggregateArtifact(artifact, {
      now: NOW,
    });

    expect(analysis.signals).toEqual([]);
    expect(analysis.sourceHealth[0].status).toBe("invalid");
  });
});
