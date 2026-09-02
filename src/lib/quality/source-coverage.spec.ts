import { describe, expect, it } from "vitest";
import type {
  SourceConfigurationEvidence,
  SourceEvidence,
  SourceManifestEntry,
} from "./source-ledger";
import {
  buildSourceCoverageReport,
  sourceCoverageObservationsFromEvidence,
  sourceSurfaceDeclarationsFromConsumers,
} from "./source-coverage";
import { SOURCE_ARTIFACT_CONSUMERS } from "./source-consumers";

function source(
  overrides: Partial<SourceManifestEntry> = {},
): SourceManifestEntry {
  return {
    id: "county_calendar",
    name: "County calendar",
    owner: "Frederick County",
    url: "https://example.test/calendar",
    license: "Public calendar; source retained",
    status: "active",
    collection: "runtime",
    refreshCadence: "hourly",
    snapshotCadence: null,
    changeCadence: null,
    manifestLastSuccess: null,
    schemaFile: null,
    transformFile: "src/lib/integrations/calendar.ts",
    evidenceAliases: ["county"],
    rowsRequired: false,
    publicationApplicability: "required",
    ...overrides,
  };
}

describe("source coverage control plane", () => {
  it("uses complete manifest configuration without inferring downstream proof", () => {
    const report = buildSourceCoverageReport(
      [source()],
      [],
      [],
    );
    const [row] = report.rows;

    expect(report.stageCounts).toEqual({
      configured: 1,
      observed: 0,
      normalized: 0,
      published: 0,
      surface: 0,
    });
    expect(row?.firstGap).toBe("observed");
    expect(row?.stages.configured.detail).toBe(
      "The active manifest records an upstream URL, collection owner, and code pointer.",
    );
  });

  it("leaves configuration unproven when its code pointer is absent", () => {
    const report = buildSourceCoverageReport(
      [source({ transformFile: null })],
      [],
      [],
    );

    expect(report.stageCounts.configured).toBe(0);
    expect(report.rows[0]?.firstGap).toBe("configured");
  });

  it("joins aliases and keeps observation, normalization, and publication separate", () => {
    const sources = [source()];
    const evidence: SourceEvidence[] = [
      {
        sourceKey: "county",
        kind: "reachability_probe",
        attemptedAt: "2026-08-10T12:00:00Z",
        outcome: "success",
      },
      {
        sourceKey: "county",
        kind: "runtime_probe",
        attemptedAt: "2026-08-10T13:00:00Z",
        outcome: "success",
        succeededAt: "2026-08-10T13:00:01Z",
        publishedAt: null,
        recordCount: 4,
      },
    ];
    const configuration: SourceConfigurationEvidence[] = [
      {
        sourceId: "county_calendar",
        configured: true,
        keyless: true,
        missingSettings: [],
      },
    ];
    const observations = sourceCoverageObservationsFromEvidence(
      sources,
      evidence,
      configuration,
    );
    const report = buildSourceCoverageReport(sources, observations, []);
    const [row] = report.rows;

    expect(observations).toEqual([
      expect.objectContaining({
        sourceId: "county_calendar",
        configured: true,
        lastObservedAt: "2026-08-10T13:00:00.000Z",
        lastNormalizedAt: "2026-08-10T13:00:01.000Z",
        lastPublishedAt: null,
      }),
    ]);
    expect(row?.stages.configured.proved).toBe(true);
    expect(row?.stages.observed.proved).toBe(true);
    expect(row?.stages.normalized.proved).toBe(true);
    expect(row?.stages.published.proved).toBe(false);
    expect(row?.firstGap).toBe("published");
  });

  it("counts product use only from an explicit source id declaration", () => {
    const sources = [source(), source({ id: "unmapped", evidenceAliases: [] })];
    const declarations = sourceSurfaceDeclarationsFromConsumers([
      {
        sourceIds: ["county_calendar"],
        powers: "County events on Today and Events",
      },
      {
        powers: "A general feed with no source id",
      },
    ]);
    const observations = sources.map((item) => ({
      sourceId: item.id,
      configured: true,
      missingSettings: [],
      lastObservedAt: "2026-08-10T12:00:00Z",
      lastNormalizedAt: "2026-08-10T12:00:00Z",
      lastPublishedAt: "2026-08-10T12:00:00Z",
    }));
    const report = buildSourceCoverageReport(
      sources,
      observations,
      declarations,
    );
    const byId = new Map(report.rows.map((row) => [row.id, row]));

    expect(report.stageCounts.surface).toBe(1);
    expect(byId.get("county_calendar")?.surfaceDescriptions).toEqual([
      "County events on Today and Events",
    ]);
    expect(byId.get("unmapped")?.stages.surface.proved).toBe(false);
  });

  it("treats explicit non-publication applicability as proved without inventing a timestamp", () => {
    const report = buildSourceCoverageReport(
      [
        source({
          id: "fc_address_points_complete",
          refreshCadence: "on_demand",
          publicationApplicability: "not_applicable",
        }),
      ],
      [
        {
          sourceId: "fc_address_points_complete",
          configured: true,
          missingSettings: [],
          lastObservedAt: "2026-08-23T00:00:00.000Z",
          lastNormalizedAt: "2026-08-23T00:00:00.000Z",
          lastPublishedAt: null,
        },
      ],
      sourceSurfaceDeclarationsFromConsumers([
        {
          sourceIds: ["fc_address_points_complete"],
          powers:
            "Bounded exact-address checks for event and map geocoding, with no bulk mirror",
        },
      ]),
    );
    const [row] = report.rows;

    expect(row?.stages.published).toEqual({
      proved: true,
      at: null,
      detail:
        "A separate publication is not applicable to this bounded on-demand adapter. This stage does not prove current runtime availability.",
    });
    expect(row?.stages.surface.proved).toBe(true);
    expect(row?.firstGap).toBeNull();
    expect(row?.surfaceDescriptions).toEqual([
      "Bounded exact-address checks for event and map geocoding, with no bulk mirror",
    ]);
  });

  it("declares artifact consumers without laundering missing publication evidence", () => {
    const report = buildSourceCoverageReport(
      [
        source({
          id: "census_tiger_county_boundary",
          collection: "workflow",
          refreshCadence: "yearly",
        }),
      ],
      [
        {
          sourceId: "census_tiger_county_boundary",
          configured: true,
          missingSettings: [],
          lastObservedAt: "2026-07-28T00:00:00.000Z",
          lastNormalizedAt: "2026-07-28T00:00:00.000Z",
          lastPublishedAt: null,
        },
      ],
      sourceSurfaceDeclarationsFromConsumers(SOURCE_ARTIFACT_CONSUMERS),
    );
    const [row] = report.rows;

    expect(row?.stages.surface.proved).toBe(true);
    expect(row?.stages.published.proved).toBe(false);
    expect(row?.firstGap).toBe("published");
    expect(row?.surfaceDescriptions).toEqual([
      "The published county boundary overlay and map frame",
    ]);
  });

  it("keeps inactive candidates out of active lifecycle totals", () => {
    const report = buildSourceCoverageReport(
      [source({ status: "pending_review", collection: null })],
      [],
      [],
    );

    expect(report).toMatchObject({ active: 0, complete: 0 });
    expect(report.rows[0]?.firstGap).toBeNull();
    expect(report.rows[0]?.stages.configured.detail).toContain(
      "pending review",
    );
  });
});
