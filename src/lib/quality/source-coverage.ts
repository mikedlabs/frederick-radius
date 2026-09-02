import type {
  SourceConfigurationEvidence,
  SourceEvidence,
  SourceLedgerRow,
  SourceManifestEntry,
} from "./source-ledger";

/**
 * The source control plane is intentionally evidence-only. A manifest row,
 * deployment key, successful HTTP probe, normalized collection, published
 * artifact, and product-surface declaration are different facts. Missing
 * proof stays missing rather than being inferred from a neighboring step.
 */

export type SourceCoverageStage =
  | "configured"
  | "observed"
  | "normalized"
  | "published"
  | "surface";

export type SourceCoverageStageEvidence = {
  proved: boolean;
  at: string | null;
  detail: string;
};

export type SourceCoverageObservation = {
  sourceId: string;
  configured: boolean | null;
  missingSettings: string[];
  lastObservedAt: string | null;
  lastNormalizedAt: string | null;
  lastPublishedAt: string | null;
};

export type SourceSurfaceDeclaration = {
  sourceId: string;
  description: string;
};

export type SourceCoverageRow = SourceManifestEntry & {
  stages: Record<SourceCoverageStage, SourceCoverageStageEvidence>;
  firstGap: SourceCoverageStage | null;
  provedStages: number;
  surfaceDescriptions: string[];
};

export type SourceCoverageReport = {
  cataloged: number;
  active: number;
  complete: number;
  stageCounts: Record<SourceCoverageStage, number>;
  rows: SourceCoverageRow[];
};

export const SOURCE_COVERAGE_STAGE_LABELS: Record<
  SourceCoverageStage,
  string
> = {
  configured: "Configured",
  observed: "Observed",
  normalized: "Normalized",
  published: "Publication",
  surface: "Product use",
};

const STAGES: SourceCoverageStage[] = [
  "configured",
  "observed",
  "normalized",
  "published",
  "surface",
];

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function newest(values: Array<string | null | undefined>): string | null {
  let latest: { iso: string; time: number } | null = null;
  for (const value of values) {
    const iso = validIso(value);
    if (!iso) continue;
    const time = Date.parse(iso);
    if (!latest || time > latest.time) latest = { iso, time };
  }
  return latest?.iso ?? null;
}

/** Convert raw, recorded evidence into one deterministic lifecycle projection. */
export function sourceCoverageObservationsFromEvidence(
  sources: readonly SourceManifestEntry[],
  evidence: readonly SourceEvidence[],
  configuration: readonly SourceConfigurationEvidence[] = [],
): SourceCoverageObservation[] {
  const sourceByKey = new Map<string, SourceManifestEntry>();
  for (const source of sources) {
    for (const key of [source.id, ...source.evidenceAliases]) {
      sourceByKey.set(key, source);
    }
  }

  const evidenceBySource = new Map<string, SourceEvidence[]>();
  for (const item of evidence) {
    const source = sourceByKey.get(item.sourceKey);
    if (!source || !validIso(item.attemptedAt)) continue;
    const rows = evidenceBySource.get(source.id) ?? [];
    rows.push(item);
    evidenceBySource.set(source.id, rows);
  }
  const configurationBySource = new Map(
    configuration.map((item) => [item.sourceId, item]),
  );

  return sources.map((source) => {
    const items = evidenceBySource.get(source.id) ?? [];
    const collected = items.filter(
      (item) => item.outcome === "success" && item.kind !== "reachability_probe",
    );
    const published = items.filter(
      (item) => validIso(item.publishedAt) !== null,
    );
    const config = configurationBySource.get(source.id);

    return {
      sourceId: source.id,
      configured: config?.configured ?? null,
      missingSettings: config?.missingSettings ?? [],
      lastObservedAt: newest(items.map((item) => item.attemptedAt)),
      lastNormalizedAt: newest(
        collected.map((item) => item.succeededAt ?? item.attemptedAt),
      ),
      lastPublishedAt: newest(published.map((item) => item.publishedAt)),
    };
  });
}

export function sourceCoverageObservationsFromLedger(
  rows: readonly SourceLedgerRow[],
): SourceCoverageObservation[] {
  return rows.map((row) => ({
    sourceId: row.id,
    configured: row.configured,
    missingSettings: row.missingSettings,
    lastObservedAt: validIso(row.lastObservedAt),
    lastNormalizedAt: validIso(row.lastSuccessAt),
    lastPublishedAt: validIso(row.lastPublishedAt),
  }));
}

export function sourceSurfaceDeclarationsFromConsumers(
  consumers: readonly {
    sourceIds?: readonly string[];
    powers: string;
  }[],
): SourceSurfaceDeclaration[] {
  return consumers.flatMap((consumer) =>
    (consumer.sourceIds ?? []).map((sourceId) => ({
      sourceId,
      description: consumer.powers.trim(),
    })),
  );
}

function recorded(
  at: string | null,
  provedDetail: string,
  missingDetail: string,
): SourceCoverageStageEvidence {
  return at
    ? { proved: true, at, detail: provedDetail }
    : { proved: false, at: null, detail: missingDetail };
}

/**
 * Build the five-step coverage report. Stage counts are independent historical
 * evidence counts, not a manufactured funnel or a live-health assertion: a
 * product use may be declared even when publication proof is missing, and an
 * evidence-complete on-demand adapter may still require request-time validation
 * before the health ledger marks it available.
 */
export function buildSourceCoverageReport(
  sources: readonly SourceManifestEntry[],
  observations: readonly SourceCoverageObservation[],
  surfaceDeclarations: readonly SourceSurfaceDeclaration[],
): SourceCoverageReport {
  const observationBySource = new Map(
    observations.map((observation) => [observation.sourceId, observation]),
  );
  const surfacesBySource = new Map<string, string[]>();
  for (const declaration of surfaceDeclarations) {
    const clean = declaration.description.trim();
    if (!clean) continue;
    const values = surfacesBySource.get(declaration.sourceId) ?? [];
    if (!values.includes(clean)) values.push(clean);
    surfacesBySource.set(declaration.sourceId, values);
  }

  const rows = sources.map((source): SourceCoverageRow => {
    const observation = observationBySource.get(source.id);
    const active = source.status === "active";
    const surfaceDescriptions = [...(surfacesBySource.get(source.id) ?? [])].sort();
    const manifestConfigured = Boolean(
      active && source.collection && source.url && source.transformFile,
    );
    const configured = !active
      ? {
          proved: false,
          at: null,
          detail: `The manifest keeps this source ${source.status.replace(/_/g, " ")}.`,
        }
        : observation?.configured === false
          ? {
              proved: false,
              at: null,
              detail: observation.missingSettings.length
                ? `Missing settings: ${observation.missingSettings.join(", ")}.`
                : "The adapter is recorded as not configured.",
            }
          : observation?.configured === true
        ? {
            proved: true,
            at: null,
            detail: "Deployment configuration is recorded.",
          }
        : manifestConfigured
          ? {
              proved: true,
              at: null,
              detail: "The active manifest records an upstream URL, collection owner, and code pointer.",
            }
          : {
              proved: false,
              at: null,
              detail: "No complete adapter configuration evidence is recorded.",
            };
    const observed = recorded(
      observation?.lastObservedAt ?? null,
      "A probe or collection attempt is recorded.",
      "No probe or collection attempt is recorded.",
    );
    const normalized = recorded(
      observation?.lastNormalizedAt ?? null,
      "A successful validated collection is recorded.",
      "No successful validated collection is recorded.",
    );
    const published = source.publicationApplicability === "not_applicable"
      ? {
          proved: true,
          at: null,
          detail:
            "A separate publication is not applicable to this bounded on-demand adapter. This stage does not prove current runtime availability.",
        }
      : recorded(
          observation?.lastPublishedAt ?? null,
          "Publication evidence is recorded.",
          "No publication evidence is recorded.",
        );
    const surface = surfaceDescriptions.length
      ? {
          proved: true,
          at: null,
          detail: surfaceDescriptions.join("; "),
        }
      : {
          proved: false,
          at: null,
          detail: "No explicit source-to-product declaration is recorded.",
        };
    const stages = { configured, observed, normalized, published, surface };
    const firstGap = active
      ? STAGES.find((stage) => !stages[stage].proved) ?? null
      : null;

    return {
      ...source,
      stages,
      firstGap,
      provedStages: STAGES.filter((stage) => stages[stage].proved).length,
      surfaceDescriptions,
    };
  });

  const activeRows = rows.filter((row) => row.status === "active");
  return {
    cataloged: rows.length,
    active: activeRows.length,
    complete: activeRows.filter((row) => row.firstGap === null).length,
    stageCounts: Object.fromEntries(
      STAGES.map((stage) => [
        stage,
        activeRows.filter((row) => row.stages[stage].proved).length,
      ]),
    ) as Record<SourceCoverageStage, number>,
    rows: rows.sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        a.provedStages - b.provedStages ||
        a.name.localeCompare(b.name),
    ),
  };
}
