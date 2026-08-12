/**
 * Evidence-only source lifecycle report.
 *
 * This command performs no network requests. It combines the generated source
 * catalog, deployment configuration visible to this process, timestamps stored
 * in checked-in artifacts, and explicit feed-to-product declarations. Missing
 * evidence stays missing.
 */
import { pathToFileURL } from "node:url";
import SOURCE_REGISTRY_RAW from "@/data/source-registry.generated.json" with { type: "json" };
import { KEYED_FEEDS, KEYLESS_FEEDS, feedStatuses } from "@/lib/integrations/feed-registry";
import { bundledSourceArtifactEvidence } from "@/lib/quality/source-artifact-evidence";
import {
  SOURCE_COVERAGE_STAGE_LABELS,
  buildSourceCoverageReport,
  sourceCoverageObservationsFromEvidence,
  sourceSurfaceDeclarationsFromFeeds,
  type SourceCoverageStage,
} from "@/lib/quality/source-coverage";
import type {
  SourceConfigurationEvidence,
  SourceEvidence,
  SourceManifestEntry,
} from "@/lib/quality/source-ledger";

const STAGES: SourceCoverageStage[] = [
  "configured",
  "observed",
  "normalized",
  "published",
  "surface",
];

export function buildLocalSourceCoverageReport() {
  const sources = SOURCE_REGISTRY_RAW as SourceManifestEntry[];
  const statuses = feedStatuses();
  const configuration: SourceConfigurationEvidence[] = [
    ...statuses.keyed,
    ...statuses.keyless,
  ].flatMap((feed) =>
    (feed.sourceIds ?? []).map((sourceId) => ({
      sourceId,
      configured: feed.configured,
      keyless: feed.keyless,
      missingSettings: feed.missingEnvs,
    })),
  );
  const manifestEvidence: SourceEvidence[] = sources.flatMap((source) =>
    source.manifestLastSuccess
      ? [
          {
            sourceKey: source.id,
            kind: "manifest" as const,
            attemptedAt: source.manifestLastSuccess,
            outcome: "success" as const,
            succeededAt: source.manifestLastSuccess,
            publishedAt: null,
            recordCount: null,
          },
        ]
      : [],
  );
  const observations = sourceCoverageObservationsFromEvidence(
    sources,
    [...manifestEvidence, ...bundledSourceArtifactEvidence()],
    configuration,
  );

  return buildSourceCoverageReport(
    sources,
    observations,
    sourceSurfaceDeclarationsFromFeeds([...KEYED_FEEDS, ...KEYLESS_FEEDS]),
  );
}

function main(): void {
  const report = buildLocalSourceCoverageReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `Source lifecycle evidence: ${report.cataloged} cataloged, ${report.active} active, ${report.complete} complete.`,
  );
  for (const stage of STAGES) {
    console.log(
      `  ${SOURCE_COVERAGE_STAGE_LABELS[stage].padEnd(12)} ${String(report.stageCounts[stage]).padStart(3)} / ${report.active}`,
    );
  }
  console.log("\nFirst unproven step for active sources:");
  for (const stage of STAGES) {
    const ids = report.rows
      .filter((row) => row.status === "active" && row.firstGap === stage)
      .map((row) => row.id);
    console.log(
      `  ${SOURCE_COVERAGE_STAGE_LABELS[stage]} (${ids.length}): ${ids.length ? ids.join(", ") : "none"}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
