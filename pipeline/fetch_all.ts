/**
 * Daily data refresh worker.
 *
 * Plain code, no model calls and no judgment. It reads the manifest,
 * fetches every active source, stores the raw response, validates it,
 * runs the deterministic transform, and writes normalized output. The
 * agent commands in AGENTS.md handle the judgment work of adding and
 * repairing sources; this script only executes the routine.
 *
 * Exit code is non zero when any active source fails to fetch or fails
 * validation, so the GitHub Action can open an issue.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { ZodType } from "zod";
import type { TransformResult } from "./lib/normalize";
import {
  fetchTextWithRetry,
  SourceBodyLimitError,
  SourceHttpError,
} from "./lib/fetch_source";
import {
  prunePipelineArtifacts,
  type CleanFormat,
} from "./lib/artifact_retention";
import { normalizedRowCount } from "./lib/output_policy";
import { seedPriorSourceState } from "./lib/source_state";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "data", "sources.yaml");

type SourceRow = {
  id: string;
  url: string;
  status: string;
  /** Which system owns freshness for an active source. */
  collection?: "pipeline" | "runtime" | "workflow";
  resolve_json_path?: string;
  format?: string;
  schema_file?: string | null;
  transform_file?: string | null;
  rows_required?: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function loadModule<T>(rel: string): Promise<T> {
  return (await import(join(ROOT, rel))) as T;
}

function summarizeZodError(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): string {
  return issues
    .slice(0, 20)
    .map((i) => {
      // Zod paths are PropertyKey, so a symbol key would throw on a
      // plain join. Stringify each segment defensively.
      const path = i.path
        .map((p) => (typeof p === "symbol" ? p.description ?? "symbol" : String(p)))
        .join(".");
      return `  at ${path || "(root)"}: ${i.message}`;
    })
    .join("\n");
}

async function processSource(
  row: SourceRow,
): Promise<{
  ok: boolean;
  reason?: string;
  payloadHash?: string;
  outputFormat?: CleanFormat;
}> {
  // Resolve a two step API when resolve_json_path is set. The points
  // response names the real forecast URL; we follow it before storing.
  let fetchUrl = row.url;
  if (row.resolve_json_path) {
    const pointer = tryParseJson(await fetchTextWithRetry(row.url));
    const next = pointer ? getByPath(pointer, row.resolve_json_path) : undefined;
    if (typeof next !== "string") {
      return { ok: false, reason: `resolve step did not yield a URL from "${row.resolve_json_path}"` };
    }
    fetchUrl = next;
  }

  const body = await fetchTextWithRetry(fetchUrl);

  // Step 3: preserve bounded diagnostic bodies for invalid or schema-drifted
  // responses. A date-stamped successful raw payload is written only after
  // validation and normalization complete, so retention never mistakes a
  // failed refresh for the latest known-good source response.
  const rawDir = join(ROOT, "data", "raw", row.id);
  mkdirSync(rawDir, { recursive: true });
  const parsed = tryParseJson(body);
  if (parsed === undefined) {
    const boundedBody = Buffer.from(body).subarray(0, 200_000).toString("utf8");
    writeFileSync(join(rawDir, `${today()}.invalid.txt`), boundedBody);
    return { ok: false, reason: "response was not JSON, raw body saved for diagnose-failure" };
  }
  const raw = parsed;

  // Step 4: validate. On failure, log the diff and continue. The raw
  // file is kept above so the failure is inspectable.
  const validator = await loadModule<{ schema: ZodType }>(`pipeline/schemas_ts/${row.id}.ts`);
  const result = validator.schema.safeParse(raw);
  if (!result.success) {
    writeFileSync(join(rawDir, `${today()}.schema-error.json`), body);
    console.error(`[${row.id}] schema validation failed:`);
    console.error(summarizeZodError(result.error.issues));
    return { ok: false, reason: "schema validation failed" };
  }

  // Step 5: transform and write normalized output.
  const mod = await loadModule<{ transform: (raw: unknown) => TransformResult }>(`transforms/${row.id}.ts`);
  const out = mod.transform(result.data);
  if (row.rows_required) {
    const count = normalizedRowCount(out);
    if (count === null) {
      return {
        ok: false,
        reason: "rows_required is set but the normalized output has no countable row boundary",
      };
    }
    if (count === 0) {
      return {
        ok: false,
        reason: "normalized output was empty for a rows_required source; last-known-good data retained",
      };
    }
  }
  const cleanDir = join(ROOT, "data", "clean");
  mkdirSync(cleanDir, { recursive: true });
  const ext = out.format === "geojson" ? "geojson" : "json";
  const serialized = JSON.stringify(out.data, null, 2);
  writeFileSync(join(cleanDir, `${row.id}.${ext}`), serialized);
  writeFileSync(join(rawDir, `${today()}.json`), JSON.stringify(parsed, null, 2));

  return {
    ok: true,
    payloadHash: createHash("sha256").update(serialized).digest("hex"),
    outputFormat: ext,
  };
}

async function main(): Promise<void> {
  const doc = parseDocument(readFileSync(MANIFEST, "utf8"));
  const seeded = seedPriorSourceState(doc, process.env.PRIOR_SOURCE_MANIFEST);
  if (seeded > 0) {
    console.log(`Seeded prior health state for ${seeded} source(s) from the previous snapshot.`);
  }
  const sources = doc.get("sources") as { items: unknown[] };
  const rows: SourceRow[] = (sources?.items ?? []).map((n) => (n as { toJSON: () => SourceRow }).toJSON());

  const active = rows.filter((r) => r.status === "active");
  const missingOwner = active.filter(
    (r) => !["pipeline", "runtime", "workflow"].includes(r.collection ?? ""),
  );
  if (missingOwner.length > 0) {
    console.error(
      `Active sources missing a collection owner: ${missingOwner.map((r) => r.id).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const managed = active.filter((r) => r.collection === "pipeline");
  console.log(
    `Processing ${managed.length} pipeline-managed active sources of ${active.length} active (${rows.length} total).`,
  );

  const failures: string[] = [];
  const successfulFormats = new Map<string, CleanFormat>();
  for (const row of managed) {
    if (!row.schema_file || !row.transform_file) {
      console.error(
        `[${row.id}] configuration error: pipeline source needs schema_file and transform_file`,
      );
      failures.push(row.id);
      continue;
    }
    const stamp = new Date().toISOString();
    try {
      const r = await processSource(row);
      if (r.ok) {
        console.log(`[${row.id}] ok`);
        if (r.outputFormat) successfulFormats.set(row.id, r.outputFormat);
        const previousHash = getRowField(doc, row.id, "last_payload_sha256");
        if (typeof r.payloadHash === "string" && r.payloadHash !== previousHash) {
          setRowField(doc, row.id, "last_changed", stamp);
        }
        if (typeof r.payloadHash === "string") {
          setRowField(doc, row.id, "last_payload_sha256", r.payloadHash);
        }
        setRowField(doc, row.id, "last_validated", stamp);
        setRowField(doc, row.id, "last_success", stamp);
      } else {
        console.error(`[${row.id}] failed: ${r.reason}`);
        setRowField(doc, row.id, "last_validated", stamp);
        failures.push(row.id);
      }
    } catch (err) {
      if (err instanceof SourceHttpError) {
        const rawDir = join(ROOT, "data", "raw", row.id);
        mkdirSync(rawDir, { recursive: true });
        writeFileSync(
          join(rawDir, `${today()}.http-error.json`),
          JSON.stringify(err.diagnostic, null, 2),
        );
        console.error(
          `[${row.id}] fetch error: ${err.message}; bounded response details saved for diagnosis`,
        );
      } else if (err instanceof SourceBodyLimitError) {
        const rawDir = join(ROOT, "data", "raw", row.id);
        mkdirSync(rawDir, { recursive: true });
        writeFileSync(
          join(rawDir, `${today()}.body-limit.json`),
          JSON.stringify(err.diagnostic, null, 2),
        );
        console.error(
          `[${row.id}] fetch error: ${err.message}; response metadata saved for diagnosis`,
        );
      } else {
        console.error(`[${row.id}] fetch error: ${err instanceof Error ? err.message : String(err)}`);
      }
      failures.push(row.id);
    }
  }

  prunePipelineArtifacts({
    dataRoot: join(ROOT, "data"),
    managedSourceIds: new Set(managed.map((row) => row.id)),
    successfulFormats,
    today: today(),
  });

  // Step 6: persist last_validated and last_success. parseDocument keeps
  // comments and formatting, so the manifest stays human readable.
  writeFileSync(MANIFEST, doc.toString());
  const finalizationMarker = process.env.PIPELINE_FINALIZATION_MARKER;
  if (finalizationMarker) {
    mkdirSync(dirname(finalizationMarker), { recursive: true });
    writeFileSync(
      finalizationMarker,
      JSON.stringify({
        finalized: true,
        managedSources: managed.length,
        failedSources: failures,
        completedAt: new Date().toISOString(),
      }),
    );
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} source(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1; // Step 7: non zero so the Action can react.
  } else {
    console.log("\nAll active sources refreshed successfully.");
  }
}

/** Set a scalar field on the manifest row with the given id, in place. */
function setRowField(doc: ReturnType<typeof parseDocument>, id: string, key: string, value: string): void {
  const sources = doc.get("sources") as { items: { get: (k: string) => unknown; set: (k: string, v: unknown) => void }[] };
  for (const node of sources.items) {
    if (node.get("id") === id) {
      node.set(key, value);
      return;
    }
  }
}

function getRowField(
  doc: ReturnType<typeof parseDocument>,
  id: string,
  key: string,
): unknown {
  const sources = doc.get("sources") as {
    items: { get: (k: string) => unknown }[];
  };
  return sources.items.find((node) => node.get("id") === id)?.get(key);
}

main();
