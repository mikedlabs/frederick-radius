/**
 * Mechanical audit for data/sources.yaml.
 *
 * The manifest is the product's source-of-truth ledger, so a runtime adapter
 * cannot remain labelled scaffold/pending after it starts feeding users. This
 * check also catches active rows with no owner or a stale/missing code pointer.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import {
  FREDERICK_COUNTY_APPROVAL_GATED_SOURCE_IDS,
  FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS,
  FREDERICK_COUNTY_SOURCE_IDS,
} from "@/lib/integrations/fcCountySource";

type Collection = "pipeline" | "runtime" | "workflow";
type SourceRow = {
  id: string;
  status: string;
  collection?: Collection;
  evidence_aliases?: string[];
  rows_required?: boolean;
  transform_file?: string | null;
};

export const REQUIRED_ACTIVE: Record<string, Collection> = {
  // Business/place spine.
  google_places: "workflow",
  business_info_extraction: "workflow",
  osm_overpass: "runtime",
  // Event spine and high-value direct ingests.
  dfp_events: "runtime",
  frederick_keys: "runtime",
  ticketmaster: "runtime",
  fcpl_libraries: "workflow",
  fcvfra_events: "workflow",
  venue_event_extraction: "workflow",
  squarespace_venue_events: "runtime",
  // Mounted live-information adapters. These contracts prevent a working
  // runtime source from remaining falsely labelled scaffold/pending in the
  // ledger after its UI or API consumer ships.
  google_news_rss: "runtime",
  reddit_frederick: "runtime",
  mta_marc_rt: "runtime",
  hood_athletics: "runtime",
  mount_athletics: "runtime",
  fcc_athletics: "runtime",
};

const REQUIRED_POLICY_GATED = [
  "pulsepoint",
  "mapillary_objects",
  "eventbrite_frederick",
  "bandsintown",
  "seatgeek",
  "frederick_county_arcgis",
  "fc_open_data_hub",
  "fc_parks_trails",
  "visit_frederick",
] as const;

const VISIT_FREDERICK_PENDING_ID = "visit_frederick";

const COUNTY_APPROVAL_GATED = FREDERICK_COUNTY_APPROVAL_GATED_SOURCE_IDS;
const COUNTY_PUBLIC_RUNTIME = FREDERICK_COUNTY_PUBLIC_RUNTIME_SOURCE_IDS;

export function auditSourceRows(
  rows: SourceRow[],
  root = process.cwd(),
  approvedCountySources: ReadonlySet<string> = new Set(),
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.id) {
      issues.push("source row is missing id");
      continue;
    }
    if (seen.has(row.id)) issues.push(`${row.id}: duplicate id`);
    seen.add(row.id);
    if (row.status !== "active") {
      if (row.collection) issues.push(`${row.id}: non-active row declares collection=${row.collection}`);
      continue;
    }
    if (!row.collection) issues.push(`${row.id}: active source has no collection owner`);
    if (!row.transform_file) {
      issues.push(`${row.id}: active source has no code/transform pointer`);
    } else if (!existsSync(resolve(root, row.transform_file))) {
      issues.push(`${row.id}: code/transform pointer does not exist (${row.transform_file})`);
    }
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const [id, collection] of Object.entries(REQUIRED_ACTIVE)) {
    const row = byId.get(id);
    if (!row) {
      issues.push(`${id}: implemented source is missing from the manifest`);
    } else if (row.status !== "active" || row.collection !== collection) {
      issues.push(
        `${id}: implemented source must be active/${collection}, found ${row.status}/${row.collection ?? "unowned"}`,
      );
    }
  }
  for (const id of REQUIRED_POLICY_GATED) {
    const row = byId.get(id);
    if (!row) {
      issues.push(`${id}: policy-gated adapter is missing from the manifest`);
    } else if (!["pending_approval", "pending_review"].includes(row.status)) {
      issues.push(`${id}: policy-gated adapter must stay pending, found ${row.status}`);
    }
  }
  const visitFrederick = byId.get(VISIT_FREDERICK_PENDING_ID);
  if (visitFrederick) {
    if (visitFrederick.status !== "pending_approval") {
      issues.push(
        `${VISIT_FREDERICK_PENDING_ID}: written factual-reuse permission is not documented; source must stay pending_approval`,
      );
    }
    if (visitFrederick.collection) {
      issues.push(
        `${VISIT_FREDERICK_PENDING_ID}: dormant approval-gated source must not declare collection`,
      );
    }
    if ((visitFrederick.evidence_aliases?.length ?? 0) > 0) {
      issues.push(
        `${VISIT_FREDERICK_PENDING_ID}: dormant approval-gated source must not require evidence aliases`,
      );
    }
    if (visitFrederick.rows_required) {
      issues.push(
        `${VISIT_FREDERICK_PENDING_ID}: dormant approval-gated source must not require evidence rows`,
      );
    }
  }
  for (const id of COUNTY_PUBLIC_RUNTIME) {
    const row = byId.get(id);
    if (!row) {
      issues.push(`${id}: public County GIS adapter is missing from the manifest`);
    } else if (row.status !== "active" || row.collection !== "runtime") {
      issues.push(
        `${id}: public County GIS adapter must be active/runtime, found ${row.status}/${row.collection ?? "unowned"}`,
      );
    }
  }
  for (const id of COUNTY_APPROVAL_GATED) {
    const row = byId.get(id);
    if (!row) {
      issues.push(`${id}: County approval-gated adapter is missing from the manifest`);
      continue;
    }
    if (approvedCountySources.has(id)) {
      if (row.status !== "active" || row.collection !== "runtime") {
        issues.push(
          `${id}: configured County source must be active/runtime in the ledger, found ${row.status}/${row.collection ?? "unowned"}`,
        );
      }
    } else if (!["pending_approval", "pending_review"].includes(row.status)) {
      issues.push(
        `${id}: County source without configured approval must stay pending, found ${row.status}`,
      );
    }
  }
  return issues;
}

export function auditSourceManifest(
  text: string,
  root = process.cwd(),
  approvedCountySources: ReadonlySet<string> = new Set(),
): string[] {
  const doc = parse(text) as { sources?: SourceRow[] };
  return auditSourceRows(doc.sources ?? [], root, approvedCountySources);
}

function main() {
  const path = resolve("data/sources.yaml");
  const masterApproved =
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED === "1";
  const approvedCountySources = new Set(
    (process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const issues = auditSourceManifest(
    readFileSync(path, "utf8"),
    process.cwd(),
    masterApproved ? approvedCountySources : new Set(),
  );
  if (masterApproved && approvedCountySources.size === 0) {
    issues.push(
      "County GIS master approval is enabled but FREDERICK_COUNTY_GIS_APPROVED_SOURCES is empty",
    );
  }
  for (const id of approvedCountySources) {
    if (!(FREDERICK_COUNTY_SOURCE_IDS as readonly string[]).includes(id)) {
      issues.push(`${id}: unknown County approval id`);
    }
  }
  if (issues.length > 0) {
    console.error(`Source registry audit failed (${issues.length}):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("Source registry audit passed.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
