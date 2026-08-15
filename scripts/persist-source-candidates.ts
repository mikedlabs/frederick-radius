/**
 * Persist review-only Tavily, Firecrawl, and Apify findings in the existing
 * field-observation evidence store. This does not publish app data. It gives
 * every provider finding a durable owner-review state instead of leaving the
 * only copy in a short-lived Actions artifact or GitHub issue.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnvironment } from "dotenv";
import {
  candidatesFromSourceReport,
  persistSourceCandidates,
  sourceCandidateReportProvider,
} from "../src/lib/source-candidates";
import { closeDb } from "../src/lib/db/client";

loadEnvironment({ path: resolve(".env.local"), quiet: true });
loadEnvironment({ quiet: true });

const DEFAULT_REPORTS = [resolve("scripts/reports/source-scout-latest.json")];

async function jsonReportsIn(directory: string, prefix: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .sort()
      .slice(-3)
      .map((name) => resolve(directory, name));
  } catch {
    return [];
  }
}

async function defaultReportPaths(): Promise<string[]> {
  return [
    ...DEFAULT_REPORTS,
    ...(await jsonReportsIn(
      resolve("scripts/reports/source-watch"),
      "source-watch-",
    )),
    ...(await jsonReportsIn(
      resolve("scripts/reports/apify-source-change-radar"),
      "apify-source-change-radar-",
    )),
  ];
}

async function main() {
  const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const paths = explicit.length
    ? explicit.map((value) => resolve(value))
    : await defaultReportPaths();
  let reports = 0;
  let candidates = 0;
  let inserted = 0;
  let skipped = 0;

  for (const path of paths) {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      if (explicit.length) throw new Error(`Source candidate report is missing: ${path}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Source candidate report is not valid JSON: ${path}`);
    }
    if (!sourceCandidateReportProvider(parsed)) {
      throw new Error(`Source candidate report has an unrecognized schema: ${path}`);
    }
    const normalized = candidatesFromSourceReport(parsed);
    reports += 1;
    candidates += normalized.length;
    if (!normalized.length) continue;
    const result = await persistSourceCandidates(normalized);
    inserted += result.inserted;
    skipped += result.skipped;
  }

  if (!reports) throw new Error("No source intelligence report was available to persist.");
  console.log(
    `Source candidate inbox: ${reports} report(s), ${candidates} candidate(s), ${inserted} inserted, ${skipped} already observed.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
