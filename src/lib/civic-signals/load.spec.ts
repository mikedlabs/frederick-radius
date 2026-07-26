import { describe, expect, it } from "vitest";
import { loadCivicSignals } from "./load";
import trackedArtifact from "./artifacts/seeclickfix-aggregate.json";
import type { SeeClickFixAggregateArtifact } from "./artifact";

describe("loadCivicSignals", () => {
  it("loads the tracked artifact but withholds values while reuse review is pending", async () => {
    const payload = await loadCivicSignals({
      now: new Date("2026-07-26T16:00:00.000Z"),
    });

    expect(payload.signals).toEqual([]);
    expect(payload.sourceHealth[0]).toMatchObject({
      status: "review-required",
      acceptedRecords: 0,
      lastObservedAt: null,
      window: null,
    });
    expect(payload.quality).toMatchObject({
      inputRecords: 0,
      acceptedRecords: 0,
      minimumCellMet: false,
    });
    expect(payload).not.toHaveProperty("facts");
  });

  it("publishes from the tracked aggregate shape only after recorded approval", async () => {
    const approved = structuredClone(
      trackedArtifact,
    ) as unknown as SeeClickFixAggregateArtifact;
    approved.publication.approved = true;
    approved.publication.reviewedAt = "2026-07-25T12:00:00.000Z";
    approved.publication.approvalBasis =
      "Written source-reuse approval recorded by the project owner.";

    const payload = await loadCivicSignals({
      now: new Date("2026-07-26T16:00:00.000Z"),
      readArtifact: async () => approved,
    });

    expect(payload.signals).toHaveLength(1);
    expect(payload.signals[0].comparison).toEqual({
      kind: "snapshot-count",
      label: "Accepted reports in the saved snapshot",
      current: 20,
      unit: "count",
    });
    expect(payload.sourceHealth[0].status).toBe("stale");
    expect(payload.quality.acceptedRecords).toBe(20);
  });

  it("fails closed when the deployable artifact is unavailable", async () => {
    const payload = await loadCivicSignals({
      now: new Date("2026-07-26T16:00:00.000Z"),
      readArtifact: async () => {
        throw new Error("missing test artifact");
      },
    });

    expect(payload.signals).toEqual([]);
    expect(payload.sourceHealth[0].status).toBe("unavailable");
    expect(payload.sourceHealth[0].note).toBe(
      "No deployable aggregate artifact is available.",
    );
    expect(payload.quality.acceptedRecords).toBe(0);
  });

  it("fails closed when a production artifact does not validate", async () => {
    const payload = await loadCivicSignals({
      now: new Date("2026-07-26T16:00:00.000Z"),
      readArtifact: async () => ({
        schemaVersion: 1,
        sourceId: "wrong-source",
        rawRecords: [{ address: "must never be accepted" }],
      }),
    });

    expect(payload.signals).toEqual([]);
    expect(payload.sourceHealth[0].status).toBe("invalid");
    expect(payload.quality.acceptedRecords).toBe(0);
  });
});
