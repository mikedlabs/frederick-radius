/** Bounded first-party refresh. A failed fetch/parse never rewrites the last good artifact or observation date. */
import { readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FCPL_HOURS_URL, FCPL_CLOSURES_URL } from "../src/lib/official-hours";
import { fetchOfficialHoursPage, parseFcplOfficialHours, officialHoursNeedsReview } from "./lib/fcpl-official-hours";

export async function refreshOfficialHours(args = process.argv.slice(2), options: {
  /** Dependency injection for offline failure/atomicity tests, never URL selection. */
  outputPath?: string;
  fetchPage?: typeof fetchOfficialHoursPage;
  now?: Date;
} = {}) {
  for (const arg of args) if (!/^--(?:dry-run$|evidence-dir=|weekly-observed-at=|closures-observed-at=)/.test(arg)) throw new Error(`Unknown option: ${arg}`);
  const fetchPage = options.fetchPage ?? fetchOfficialHoursPage;
  const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const evidence = value("evidence-dir");
  const weeklyObserved = value("weekly-observed-at");
  const closuresObserved = value("closures-observed-at");
  if (evidence && (!weeklyObserved || !closuresObserved)) throw new Error("Offline evidence requires both actual observation timestamps.");
  if (!evidence && (weeklyObserved || closuresObserved)) throw new Error("Live observations are recorded only after each successful response.");
  const weekly = evidence ? { url: FCPL_HOURS_URL, html: readFileSync(resolve(evidence, "fcpl-hours-index-20261012.html"), "utf8"), observedAt: weeklyObserved! } : await fetchPage(FCPL_HOURS_URL);
  const closures = evidence ? { url: FCPL_CLOSURES_URL, html: readFileSync(resolve(evidence, "fcpl-holiday-closings-20261012.html"), "utf8"), observedAt: closuresObserved! } : await fetchPage(FCPL_CLOSURES_URL);
  const artifact = parseFcplOfficialHours(weekly, closures, options.now);
  const output = options.outputPath ?? resolve("src/data/places-official-hours.json");
  let previous: unknown;
  try { previous = JSON.parse(readFileSync(output, "utf8")); } catch { previous = undefined; }
  const reviewRequired = officialHoursNeedsReview(previous, artifact);
  if (!args.includes("--dry-run")) {
    const temporary = `${output}.tmp`;
    writeFileSync(temporary, JSON.stringify(artifact, null, 2) + "\n");
    renameSync(temporary, output);
  }
  console.log(JSON.stringify({ status: "complete", reviewRequired, dryRun: args.includes("--dry-run"), source: artifact.source_id, places: artifact.places.length, dateExceptions: artifact.closures.exceptions.length, observedAt: [weekly.observedAt, closures.observedAt], expiresAt: artifact.expires_at }));
  return { reviewRequired, artifact };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshOfficialHours().then(({ reviewRequired }) => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `review_required=${reviewRequired}\n`);
  }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
