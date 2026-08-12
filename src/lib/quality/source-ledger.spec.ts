import { describe, expect, it } from "vitest";
import {
  buildRuntimeProbeEvidence,
  buildSourceLedger,
  cadenceMaxAgeHours,
  type SourceConfigurationEvidence,
  type SourceEvidence,
  type SourceManifestEntry,
} from "./source-ledger";

const NOW = new Date("2026-07-28T12:00:00.000Z");

function source(
  overrides: Partial<SourceManifestEntry> = {},
): SourceManifestEntry {
  return {
    id: "county_calendar",
    name: "County calendar",
    owner: "Frederick County",
    url: "https://example.test/county-calendar",
    license: "public",
    status: "active",
    collection: "runtime",
    refreshCadence: "hourly",
    snapshotCadence: null,
    changeCadence: null,
    manifestLastSuccess: null,
    schemaFile: null,
    transformFile: "src/lib/integrations/ical-live.ts",
    evidenceAliases: ["county"],
    rowsRequired: false,
    ...overrides,
  };
}

function success(
  overrides: Partial<SourceEvidence> = {},
): SourceEvidence {
  return {
    sourceKey: "county",
    kind: "feed_snapshot",
    attemptedAt: "2026-07-28T11:00:00.000Z",
    outcome: "success",
    succeededAt: "2026-07-28T11:00:00.000Z",
    publishedAt: "2026-07-28T11:00:00.000Z",
    recordCount: 12,
    ...overrides,
  };
}

function configured(
  overrides: Partial<SourceConfigurationEvidence> = {},
): SourceConfigurationEvidence {
  return {
    sourceId: "county_calendar",
    configured: true,
    keyless: true,
    missingSettings: [],
    ...overrides,
  };
}

describe("source health ledger", () => {
  it("keeps zero-row runtime publication evidence explicit", () => {
    const evidence = buildRuntimeProbeEvidence(
      {
        events: [
          { source: "county" },
          { source: "county" },
        ],
        sources_succeeded: ["county", "city", "county"],
        sources_failed: ["broken"],
      },
      "2026-07-28T11:00:00.000Z",
    );

    expect(evidence.slice(0, 2)).toEqual([
      expect.objectContaining({
        sourceKey: "county",
        outcome: "success",
        publishedAt: "2026-07-28T11:00:00.000Z",
        recordCount: 2,
      }),
      expect.objectContaining({
        sourceKey: "city",
        outcome: "success",
        recordCount: 0,
      }),
    ]);
    expect(evidence[2]).toMatchObject({
      sourceKey: "broken",
      outcome: "failure",
    });
    expect(evidence[2]).not.toHaveProperty("publishedAt");
  });

  it("does not let a successful zero-row runtime probe hide a required-empty source", () => {
    const evidence = buildRuntimeProbeEvidence(
      {
        events: [],
        sources_succeeded: ["county"],
        sources_failed: [],
      },
      "2026-07-28T11:00:00.000Z",
    );
    const [row] = buildSourceLedger(
      [source({ rowsRequired: true })],
      evidence,
      [configured()],
      NOW,
    );

    expect(row.state).toBe("required_empty");
    expect(row.available).toBe(false);
  });

  it("does not treat configuration as availability", () => {
    const [row] = buildSourceLedger(
      [source()],
      [],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      configured: true,
      available: false,
      state: "unknown",
      reasonCode: "source_not_observed",
      recommendedAction: "run_collection",
      lastObservedAt: null,
      lastReachabilityAt: null,
      lastAttemptAt: null,
    });
  });

  it("turns reachability-only unknown into an actionable diagnosis", () => {
    const [row] = buildSourceLedger(
      [source()],
      [{
        sourceKey: "county",
        kind: "reachability_probe",
        attemptedAt: "2026-07-28T11:45:00.000Z",
        outcome: "success",
      }],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      state: "unknown",
      available: false,
      reasonCode: "upstream_reachable_validation_missing",
      recommendedAction: "record_validation_or_publication",
      lastObservedAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityOutcome: "success",
      lastAttemptAt: null,
      lastPublishedAt: null,
    });
    expect(row.reason).toContain("upstream answered a reachability check");
  });

  it("retires an older reachability failure after a newer successful probe", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        {
          sourceKey: "county",
          kind: "reachability_probe",
          attemptedAt: "2026-07-28T10:45:00.000Z",
          outcome: "failure",
          error: "The upstream endpoint timed out.",
        },
        {
          sourceKey: "county",
          kind: "reachability_probe",
          attemptedAt: "2026-07-28T11:45:00.000Z",
          outcome: "success",
        },
      ],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      state: "unknown",
      available: false,
      reasonCode: "upstream_reachable_validation_missing",
      recommendedAction: "record_validation_or_publication",
      lastObservedAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityOutcome: "success",
      lastAttemptAt: null,
      lastAttemptOutcome: null,
      latestError: null,
    });
  });

  it("does not let reachability recovery clear an unresolved parser failure", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        {
          sourceKey: "county",
          kind: "ingest_run",
          attemptedAt: "2026-07-28T10:45:00.000Z",
          outcome: "failure",
          error: "Parser rejected the response.",
        },
        {
          sourceKey: "county",
          kind: "reachability_probe",
          attemptedAt: "2026-07-28T11:45:00.000Z",
          outcome: "success",
        },
      ],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      state: "failing",
      reasonCode: "collection_failed",
      recommendedAction: "repair_collection",
      lastReachabilityOutcome: "success",
      lastAttemptAt: "2026-07-28T10:45:00.000Z",
      lastAttemptOutcome: "failure",
      latestError: "Parser rejected the response.",
    });
  });

  it("keeps an in-progress reachability observation out of never-observed", () => {
    const [row] = buildSourceLedger(
      [source()],
      [{
        sourceKey: "county",
        kind: "reachability_probe",
        attemptedAt: "2026-07-28T11:45:00.000Z",
        outcome: "running",
      }],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      state: "running",
      reasonCode: "collection_running",
      recommendedAction: "inspect_running_collection",
      lastObservedAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityOutcome: "running",
    });
  });

  it("distinguishes an upstream outage from a parser or collection failure", () => {
    const [upstream, collection] = buildSourceLedger(
      [
        source({ id: "upstream", evidenceAliases: ["upstream"] }),
        source({ id: "collection", evidenceAliases: ["collection"] }),
      ],
      [
        {
          sourceKey: "upstream",
          kind: "reachability_probe",
          attemptedAt: "2026-07-28T11:45:00.000Z",
          outcome: "failure",
        },
        {
          sourceKey: "collection",
          kind: "ingest_run",
          attemptedAt: "2026-07-28T11:45:00.000Z",
          outcome: "failure",
        },
      ],
      [
        configured({ sourceId: "upstream" }),
        configured({ sourceId: "collection" }),
      ],
      NOW,
    ).sort((a, b) => b.id.localeCompare(a.id));

    expect(upstream).toMatchObject({
      id: "upstream",
      state: "failing",
      reasonCode: "upstream_unreachable",
      recommendedAction: "retry_upstream",
    });
    expect(collection).toMatchObject({
      id: "collection",
      state: "failing",
      reasonCode: "collection_failed",
      recommendedAction: "repair_collection",
    });
  });

  it("lets a newer failure outrank an older success", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        success({ attemptedAt: "2026-07-28T10:00:00.000Z" }),
        {
          sourceKey: "county",
          kind: "ingest_run",
          attemptedAt: "2026-07-28T11:30:00.000Z",
          outcome: "failure",
          error: "upstream\u0000 schema changed",
        },
      ],
      [configured()],
      NOW,
    );

    expect(row.state).toBe("failing");
    expect(row.available).toBe(false);
    expect(row.latestError).toBe("upstream schema changed");
    expect(row.lastSuccessAt).toBe("2026-07-28T11:00:00.000Z");
  });

  it("recovers when a success is newer than the failed attempt", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        {
          sourceKey: "county",
          kind: "ingest_run",
          attemptedAt: "2026-07-28T09:00:00.000Z",
          outcome: "failure",
          error: "temporary error",
        },
        success(),
      ],
      [configured()],
      NOW,
    );

    expect(row.state).toBe("healthy");
    expect(row.available).toBe(true);
  });

  it("accepts a successful empty result unless the source requires rows", () => {
    const evidence = [success({ recordCount: 0 })];
    const [allowed, required] = buildSourceLedger(
      [
        source({ id: "allowed", evidenceAliases: ["allowed"] }),
        source({
          id: "required",
          evidenceAliases: ["required"],
          rowsRequired: true,
        }),
      ],
      [
        { ...evidence[0], sourceKey: "allowed" },
        { ...evidence[0], sourceKey: "required" },
      ],
      [
        configured({ sourceId: "allowed" }),
        configured({ sourceId: "required" }),
      ],
      NOW,
    ).sort((a, b) => a.id.localeCompare(b.id));

    expect(allowed.state).toBe("healthy_empty");
    expect(allowed.available).toBe(true);
    expect(required.state).toBe("required_empty");
    expect(required.available).toBe(false);
  });

  it("distinguishes collection from publication", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        success({
          publishedAt: null,
          recordCount: 40,
        }),
      ],
      [configured()],
      NOW,
    );

    expect(row.state).toBe("awaiting_publish");
    expect(row.lastSuccessAt).not.toBeNull();
    expect(row.lastPublishedAt).toBeNull();
  });

  it("marks published evidence stale against the declared cadence", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        success({
          attemptedAt: "2026-07-28T06:00:00.000Z",
          succeededAt: "2026-07-28T06:00:00.000Z",
          publishedAt: "2026-07-28T06:00:00.000Z",
        }),
      ],
      [configured()],
      NOW,
    );

    expect(row.state).toBe("stale");
    expect(row.freshness).toMatchObject({
      state: "stale",
      ageHours: 6,
      maxAgeHours: 3,
    });
  });

  it("does not let a future evidence timestamp keep a source green", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        success({
          attemptedAt: "2026-07-29T11:00:00.000Z",
          succeededAt: "2026-07-29T11:00:00.000Z",
          publishedAt: "2026-07-29T11:00:00.000Z",
        }),
      ],
      [configured()],
      NOW,
    );

    expect(row.state).toBe("invalid_evidence");
    expect(row.available).toBe(false);
    expect(row.freshness.state).toBe("invalid");
  });

  it("rejects future reachability without exposing it as the latest observation", () => {
    const [row] = buildSourceLedger(
      [source()],
      [
        {
          sourceKey: "county",
          kind: "reachability_probe",
          attemptedAt: "2026-07-28T11:45:00.000Z",
          outcome: "success",
        },
        {
          sourceKey: "county",
          kind: "reachability_probe",
          attemptedAt: "2026-07-29T11:45:00.000Z",
          outcome: "success",
        },
      ],
      [configured()],
      NOW,
    );

    expect(row).toMatchObject({
      state: "invalid_evidence",
      available: false,
      reasonCode: "evidence_timestamp_invalid",
      recommendedAction: "repair_evidence_timestamp",
      lastObservedAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityAt: "2026-07-28T11:45:00.000Z",
      lastReachabilityOutcome: "success",
      lastAttemptAt: null,
    });
  });

  it("keeps non-active manifest rows out of operational health", () => {
    const [row] = buildSourceLedger(
      [source({ status: "pending_review" })],
      [],
      [configured({ configured: false, missingSettings: ["APPROVAL"] })],
      NOW,
    );

    expect(row.state).toBe("inactive");
    expect(row.available).toBe(false);
  });
});

describe("cadence parsing", () => {
  it("recognizes annotated cadence labels and excludes on-demand work", () => {
    expect(cadenceMaxAgeHours("hourly (request-time, 1h fetch cache)")).toBe(3);
    expect(cadenceMaxAgeHours("weekly")).toBe(240);
    expect(cadenceMaxAgeHours("on_demand")).toBeNull();
  });
});
