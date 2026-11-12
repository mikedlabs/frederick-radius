import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { merchantHoursBatchTemplate, reviewMerchantHoursBatch } from "./lib/review-merchant-hours-batch";
import { commitMerchantHours } from "./lib/commit-merchant-hours";

/** No source reads, providers, builds or publication. --apply changes only the
 * reviewed merchant artifact; rebuild affected streams in the normal release.
 */
export function runOfficialHoursBatch(args = process.argv.slice(2), now = new Date()) {
  for (const arg of args) if (!/^--(?:artifact=.+|plan=.+|template$|apply$)$/.test(arg)) throw new Error(`Unknown batch option: ${arg}`);
  for (const prefix of ["--artifact=", "--plan="]) if (args.filter((arg) => arg.startsWith(prefix)).length > 1) throw new Error("Duplicate batch option.");
  const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const path = resolve(option("artifact") ?? "src/data/places-merchant-hours.json");
  if (args.includes("--template")) {
    if (option("plan") || args.includes("--apply")) throw new Error("A held template cannot apply decisions.");
    return merchantHoursBatchTemplate(readFileSync(path, "utf8"));
  }
  const planFile = option("plan");
  if (!planFile) throw new Error("An explicit reviewed --plan is required. Use --template to prepare held decisions.");
  const planPath = resolve(planFile);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const original = readFileSync(path, "utf8");
  const result = reviewMerchantHoursBatch(original, plan, (file) => readFileSync(resolve(dirname(planPath), file), "utf8"), now);
  if (args.includes("--apply") && result.accepted.length) commitMerchantHours(path, original, result.artifact);
  return { dry_run: !args.includes("--apply"), accepted: result.accepted, held: result.held, remaining_review: result.artifact.review.length, publication_required: result.accepted.length > 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runOfficialHoursBatch(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
