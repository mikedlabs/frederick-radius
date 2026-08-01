/**
 * Build the small runtime read model for the data-source ledger.
 *
 * data/sources.yaml remains the only editable catalog. Next server bundles do
 * not reliably include arbitrary YAML files, so the admin read path imports
 * this generated JSON instead. A contract test compares both files and fails
 * when the generated copy has not been refreshed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export type SourceRegistryArtifactRow = {
  id: string;
  name: string;
  owner: string | null;
  status: string;
  collection: "pipeline" | "runtime" | "workflow" | null;
  refreshCadence: string;
  manifestLastSuccess: string | null;
  evidenceAliases: string[];
  rowsRequired: boolean;
};

type ManifestRow = {
  id?: unknown;
  name?: unknown;
  owner?: unknown;
  status?: unknown;
  collection?: unknown;
  refresh_cadence?: unknown;
  snapshot_cadence?: unknown;
  change_cadence?: unknown;
  last_success?: unknown;
  evidence_aliases?: unknown;
  rows_required?: unknown;
};

const SOURCE_STATUSES = new Set([
  "active",
  "pending_approval",
  "pending_review",
  "scaffold",
]);
const SOURCE_NAME_COLLATOR = new Intl.Collator("en-US", {
  sensitivity: "variant",
  usage: "sort",
});
const REFRESH_CADENCE =
  /^(?:realtime|hourly|daily|weekly|monthly|quarterly|yearly|on_demand)(?:\s*\([^)]*\))?$/;
const MONITORED_CADENCE =
  /^(?:realtime|hourly|daily|weekly|monthly|quarterly|yearly)$/;

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const clean = value.trim();
    return clean || null;
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function buildSourceRegistryArtifact(text: string): SourceRegistryArtifactRow[] {
  const parsed = parse(text) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { sources?: unknown }).sources)
  ) {
    throw new Error("The source manifest needs a sources array.");
  }
  const rows = (parsed as { sources: ManifestRow[] }).sources;
  const artifact = rows.map((row): SourceRegistryArtifactRow => {
    const id = scalar(row.id);
    const name = scalar(row.name);
    const status = scalar(row.status);
    const refreshCadence = scalar(row.refresh_cadence);
    if (!id || !name || !status || !refreshCadence) {
      throw new Error("Every source row needs id, name, status, and refresh_cadence.");
    }
    if (!SOURCE_STATUSES.has(status)) {
      throw new Error(`${id}: unsupported source status "${status}".`);
    }
    if (!REFRESH_CADENCE.test(refreshCadence)) {
      throw new Error(`${id}: unsupported refresh_cadence "${refreshCadence}".`);
    }
    for (const [field, value] of [
      ["snapshot_cadence", row.snapshot_cadence],
      ["change_cadence", row.change_cadence],
    ] as const) {
      if (value === undefined) continue;
      const cadence = scalar(value);
      if (!cadence || !MONITORED_CADENCE.test(cadence)) {
        throw new Error(`${id}: unsupported ${field} "${String(value)}".`);
      }
    }
    const collection = scalar(row.collection);
    if (
      collection !== null &&
      collection !== "pipeline" &&
      collection !== "runtime" &&
      collection !== "workflow"
    ) {
      throw new Error(`${id}: unsupported collection owner "${collection}".`);
    }
    if (status === "active" && collection === null) {
      throw new Error(`${id}: active sources need a collection owner.`);
    }
    if (status !== "active" && collection !== null) {
      throw new Error(`${id}: non-active sources cannot declare collection=${collection}.`);
    }
    if (
      row.evidence_aliases !== undefined &&
      (!Array.isArray(row.evidence_aliases) ||
        row.evidence_aliases.some(
          (value) => typeof value !== "string" || !value.trim(),
        ))
    ) {
      throw new Error(`${id}: evidence_aliases must contain non-empty strings.`);
    }
    if (
      row.rows_required !== undefined &&
      typeof row.rows_required !== "boolean"
    ) {
      throw new Error(`${id}: rows_required must be true or false.`);
    }
    const evidenceAliases = Array.isArray(row.evidence_aliases)
      ? row.evidence_aliases.map((value) => (value as string).trim())
      : [];
    const manifestLastSuccess = scalar(row.last_success);
    if (
      manifestLastSuccess !== null &&
      !Number.isFinite(Date.parse(manifestLastSuccess))
    ) {
      throw new Error(`${id}: last_success must be a valid date or null.`);
    }
    return {
      id,
      name,
      owner: scalar(row.owner),
      status,
      collection,
      refreshCadence,
      manifestLastSuccess,
      evidenceAliases: [...new Set(evidenceAliases)].sort(),
      rowsRequired: row.rows_required === true,
    };
  });

  const ids = new Set<string>();
  const evidenceKeys = new Map<string, string>();
  for (const row of artifact) {
    if (ids.has(row.id)) throw new Error(`${row.id}: duplicate source id.`);
    ids.add(row.id);
    for (const key of [row.id, ...row.evidenceAliases]) {
      const owner = evidenceKeys.get(key);
      if (owner && owner !== row.id) {
        throw new Error(`${key}: evidence alias belongs to both ${owner} and ${row.id}.`);
      }
      evidenceKeys.set(key, row.id);
    }
  }

  return artifact.sort(
    (a, b) =>
      SOURCE_NAME_COLLATOR.compare(a.name, b.name) ||
      a.id.localeCompare(b.id, "en-US"),
  );
}

function main(): void {
  const manifestPath = resolve("data/sources.yaml");
  const outputPath = resolve("src/data/source-registry.generated.json");
  const artifact = buildSourceRegistryArtifact(
    readFileSync(manifestPath, "utf8"),
  );
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${artifact.length} source rows to ${outputPath}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
