#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import CLIENT from "@/data/places-client.json" with { type: "json" };
import REFRESH from "@/data/places-hours-refresh.json" with { type: "json" };
import MERCHANT from "@/data/places-merchant-hours.json" with { type: "json" };
import OFFICIAL from "@/data/places-official-hours.json" with { type: "json" };
import { publicPlaces, decoratePlace, hoursRefreshForAcceptedIdentity } from "@/lib/loaders/places";
import { parseGoogleHours } from "@/lib/googleHours";
import { validateDataRelease } from "./lib/data-release.mjs";
import { buildListingMaintenanceReport, renderListingMaintenanceMarkdown, type HoursInventory, type MaintenancePlace } from "./lib/listing-maintenance";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function parseMaintenanceArguments(args: string[]): { outputDir?: string; gitSha?: string; candidateLimit: number } {
  const result: { outputDir?: string; gitSha?: string; candidateLimit: number } = { candidateLimit: 20 };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!["--output-dir", "--git-sha", "--candidate-limit"].includes(key) || seen.has(key) || !value || value.startsWith("--")) throw new Error(`Invalid or duplicate report option: ${key}`);
    seen.add(key);
    if (key === "--output-dir") result.outputDir = resolve(value);
    if (key === "--git-sha") { if (!/^[a-f0-9]{40}$/.test(value)) throw new Error("Invalid exact git SHA."); result.gitSha = value; }
    if (key === "--candidate-limit") { if (!/^\d+$/.test(value) || Number(value) > 100) throw new Error("Candidate limit must be 0–100."); result.candidateLimit = Number(value); }
  }
  return result;
}

export function runListingMaintenanceReport(args: string[] = process.argv.slice(2)) {
  const options = parseMaintenanceArguments(args);
  const now = new Date();
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "src/data/data-release.json"), "utf8"));
  const validation = validateDataRelease(manifest, ROOT);
  if (validation.errors.length) throw new Error(`Promoted artifact validation failed: ${validation.errors.join("; ")}`);
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (options.gitSha && options.gitSha !== actualSha) throw new Error("Supplied revision differs from the checked-out report source.");
  const gitSha = options.gitSha ?? actualSha;
  const readModelState = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).trim() ? "working_tree" : "committed";
  const source = new Map(publicPlaces().map((place) => [place.slug, place]));
  const inventory: Record<string, HoursInventory> = {};
  const places = (CLIENT as unknown as MaintenancePlace[]).map((client) => {
    const raw = source.get(client.slug);
    if (!raw) throw new Error(`Promoted client slug has no canonical source: ${client.slug}`);
    const canonical = decoratePlace(raw, undefined, now);
    const row = (REFRESH as Record<string, { place_id?: string; weekday_hours?: string[]; refreshed_at?: string }>)[client.slug];
    const accepted = hoursRefreshForAcceptedIdentity(row, canonical.google_place_id);
    inventory[client.slug] = { hasSchedule: Boolean((row?.weekday_hours && parseGoogleHours(row.weekday_hours)) || raw.hours),
      observedAt: accepted?.refreshed_at ?? client.hours_updated_at,
      // A rejected identity is not allowed to contribute historical hours.
      identityAccepted: !row?.weekday_hours || Boolean(accepted) };
    // Retain only the promoted hero. Rich exact attribution is already in the
    // canonical offline loader; it cannot create an extra Google browse fetch.
    return { ...client, google_photo_attribution: canonical.google_photo_attribution, google_photo_attributions: canonical.google_photo_attributions };
  });
  if (source.size !== places.length) throw new Error("Promoted client/canonical public catalog counts differ.");
  const report = { ...buildListingMaintenanceReport({ places, asOf: now, gitSha, dataVersion: manifest.data_version,
    officialHours: OFFICIAL, merchantHours: MERCHANT, hoursInventory: inventory,
    candidateLimit: options.candidateLimit,
    localAssetExists: (src) => { const file = resolve(ROOT, "public", `.${src}`); return file.startsWith(`${resolve(ROOT, "public")}/`) && existsSync(file); } }), read_model_state: readModelState };
  if (options.outputDir) {
    mkdirSync(options.outputDir, { recursive: true });
    writeFileSync(resolve(options.outputDir, "listing-maintenance.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(resolve(options.outputDir, "listing-maintenance.md"), `${readModelState === "working_tree" ? "Working-tree draft. The git revision is the base; the data version identifies these local artifacts." : "Committed-source inventory. This report does not certify the live deployment."}\n\n${renderListingMaintenanceMarkdown(report)}`);
  }
  console.log(JSON.stringify({ as_of: report.as_of, git_sha: report.git_sha, read_model_state: report.read_model_state, data_version: report.data_version, ...report.summary, candidates: report.candidate_queue.length, output_dir: options.outputDir ?? null }, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runListingMaintenanceReport(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
