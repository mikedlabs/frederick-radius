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

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { ZodType } from "zod";
import type { TransformResult } from "./lib/normalize";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "data", "sources.yaml");

const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

type SourceRow = {
  id: string;
  url: string;
  status: string;
  resolve_json_path?: string;
  format?: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

async function fetchTextWithRetry(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          // NWS and several civic feeds reject requests without a
          // descriptive User-Agent, so identify the project.
          "User-Agent": "Frederick Radius data pipeline (miked@madproductions.io)",
          Accept: "application/json, application/geo+json;q=0.9, */*;q=0.5",
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Return the body as text. The caller decides whether it parses
      // as JSON, so a non JSON block or redirect page is still captured
      // for diagnose-failure rather than thrown away here.
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff: 1s, then 2s, before the final attempt.
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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

async function processSource(row: SourceRow): Promise<{ ok: boolean; reason?: string }> {
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

  // Step 3: always save the raw response before validating, so bad data
  // is never silently dropped and diagnose-failure can inspect it, even
  // when the upstream returns an HTML block or redirect page instead of
  // JSON.
  const rawDir = join(ROOT, "data", "raw", row.id);
  mkdirSync(rawDir, { recursive: true });
  const parsed = tryParseJson(body);
  if (parsed === undefined) {
    writeFileSync(join(rawDir, `${today()}.invalid.txt`), body.slice(0, 200_000));
    return { ok: false, reason: "response was not JSON, raw body saved for diagnose-failure" };
  }
  writeFileSync(join(rawDir, `${today()}.json`), JSON.stringify(parsed, null, 2));
  const raw = parsed;

  // Step 4: validate. On failure, log the diff and continue. The raw
  // file is kept above so the failure is inspectable.
  const validator = await loadModule<{ schema: ZodType }>(`pipeline/schemas_ts/${row.id}.ts`);
  const result = validator.schema.safeParse(raw);
  if (!result.success) {
    console.error(`[${row.id}] schema validation failed:`);
    console.error(summarizeZodError(result.error.issues));
    return { ok: false, reason: "schema validation failed" };
  }

  // Step 5: transform and write normalized output.
  const mod = await loadModule<{ transform: (raw: unknown) => TransformResult }>(`transforms/${row.id}.ts`);
  const out = mod.transform(result.data);
  const cleanDir = join(ROOT, "data", "clean");
  mkdirSync(cleanDir, { recursive: true });
  const ext = out.format === "geojson" ? "geojson" : "json";
  writeFileSync(join(cleanDir, `${row.id}.${ext}`), JSON.stringify(out.data, null, 2));

  return { ok: true };
}

async function main(): Promise<void> {
  const doc = parseDocument(readFileSync(MANIFEST, "utf8"));
  const sources = doc.get("sources") as { items: unknown[] };
  const rows: SourceRow[] = (sources?.items ?? []).map((n) => (n as { toJSON: () => SourceRow }).toJSON());

  const active = rows.filter((r) => r.status === "active");
  console.log(`Processing ${active.length} active sources of ${rows.length} total.`);

  const failures: string[] = [];
  for (const row of active) {
    const stamp = new Date().toISOString();
    try {
      const r = await processSource(row);
      if (r.ok) {
        console.log(`[${row.id}] ok`);
        setRowField(doc, row.id, "last_validated", stamp);
        setRowField(doc, row.id, "last_success", stamp);
      } else {
        console.error(`[${row.id}] failed: ${r.reason}`);
        setRowField(doc, row.id, "last_validated", stamp);
        failures.push(row.id);
      }
    } catch (err) {
      console.error(`[${row.id}] fetch error: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(row.id);
    }
  }

  // Step 6: persist last_validated and last_success. parseDocument keeps
  // comments and formatting, so the manifest stays human readable.
  writeFileSync(MANIFEST, doc.toString());

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

main();
