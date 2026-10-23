import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareOfficialListingHoursHandoff, type OfficialListingIntakeEvidence } from "./lib/official-listing-intake";

type EvidenceIndex = {
  schema_version: 1; source_revision: string; collection_complete: boolean;
  records: (Omit<OfficialListingIntakeEvidence, "html"> & { evidence_file: string })[];
};
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Explicit offline selection only. --write creates a NEW private handoff;
 * neither mode changes the repository, approved artifact, registry or source.
 * An older captured revision may reconcile onto reviewed current code, but the
 * operator must pin that exact original index revision, never silently relabel it.
 */
export function stageOfficialListingHours(args = process.argv.slice(2), now = new Date()) {
  for (const arg of args) if (!/^--(?:index=.+|source-revision=[a-f0-9]{40}|select=[a-z0-9-]+@[a-f0-9]{64}|artifact=.+|output-dir=.+|write)$/.test(arg)) throw new Error(`Unsupported offline intake option: ${arg}`);
  for (const prefix of ["--index=", "--source-revision=", "--artifact=", "--output-dir=", "--write"]) if (args.filter((arg) => arg.startsWith(prefix)).length > 1) throw new Error("Duplicate offline intake option.");
  const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const indexFile = option("index"), revision = option("source-revision");
  const selections = args.filter((arg) => arg.startsWith("--select=")).map((arg) => arg.slice(9));
  if (!indexFile || !revision || !selections.length || new Set(selections).size !== selections.length) throw new Error("Pin --index, its exact --source-revision and one or more unique --select=slug@source_sha256 values.");
  const slugs = selections.map((selection) => selection.slice(0, selection.indexOf("@")));
  if (new Set(slugs).size !== slugs.length) throw new Error("Explicitly select only one original receipt for each listing.");
  const indexPath = resolve(indexFile), indexBytes = readFileSync(indexPath, "utf8");
  const index = JSON.parse(indexBytes) as EvidenceIndex;
  if (!index || index.schema_version !== 1 || index.source_revision !== revision || typeof index.collection_complete !== "boolean" || !Array.isArray(index.records)) throw new Error("Original evidence index does not match the pinned source revision or schema.");
  const selected = selections.map((selection) => {
    const [slug, sha] = selection.split("@");
    const matches = index.records.filter((record) => record.identity?.slug === slug && record.source_sha256 === sha);
    if (matches.length !== 1) throw new Error(`Selection must identify exactly one original response: ${slug}`);
    const record = matches[0];
    if (record.source_revision !== revision || typeof record.evidence_file !== "string" || !record.evidence_file
      || isAbsolute(record.evidence_file) || record.evidence_file.includes("/") || record.evidence_file.includes("\\") || record.evidence_file === "." || record.evidence_file === "..") throw new Error("Original record revision or local evidence path is invalid.");
    const path = resolve(dirname(indexPath), record.evidence_file), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 512 * 1024 || stat.size !== record.bytes) throw new Error("Original evidence file size or type does not match its capture.");
    const original = readFileSync(path);
    if (digest(original) !== record.source_sha256) throw new Error("Original evidence bytes do not match their recorded capture hash.");
    const { evidence_file: originalFile, ...metadata } = record;
    return { original, original_file: originalFile, evidence_file: `evidence-${sha}.html`, evidence: { ...metadata, html: original.toString("utf8") } };
  });
  const artifactPath = resolve(option("artifact") ?? "src/data/places-merchant-hours.json");
  const artifactBytes = readFileSync(artifactPath, "utf8");
  const result = prepareOfficialListingHoursHandoff(artifactBytes, selected, now);
  const write = args.includes("--write"), output = option("output-dir");
  if (write && !output) throw new Error("--write requires a new private --output-dir outside the repository.");
  if (!write && output) throw new Error("Dry-run writes no output. Add --write only for a new private handoff directory.");
  let outputDirectory: string | undefined;
  if (write) {
    outputDirectory = resolve(output!);
    const checkoutRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    // A lexically private path may have a symlinked parent pointing into
    // public/. Inspect the existing real parent before creating any output.
    const realOutput = resolve(realpathSync(dirname(outputDirectory)), basename(outputDirectory));
    const withinCheckout = relative(checkoutRoot, realOutput);
    const outsideCheckout = withinCheckout === ".." || withinCheckout.startsWith(`..${sep}`) || isAbsolute(withinCheckout);
    if (!isAbsolute(output!) || !outsideCheckout) throw new Error("Handoff output must be a new absolute private directory outside the repository.");
    mkdirSync(outputDirectory, { mode: 0o700 });
    const written = new Set<string>();
    for (const row of selected) if (!written.has(row.evidence_file)) {
      writeFileSync(resolve(outputDirectory, row.evidence_file), row.original, { mode: 0o600, flag: "wx" }); written.add(row.evidence_file);
    }
    const writeJson = (file: string, value: unknown) => writeFileSync(resolve(outputDirectory!, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    writeFileSync(resolve(outputDirectory, "pending-merchant-hours.json"), result.artifact_bytes, { mode: 0o600, flag: "wx" });
    writeJson("review-plan.json", result.plan);
    writeJson("review-handoff.json", { schema_version: 1, source_revision: revision, original_index_sha256: digest(indexBytes), collection_complete: index.collection_complete,
      approved_baseline_sha256: digest(artifactBytes), staged: result.staged, blocked: result.blocked,
      selected: selected.map(({ evidence, evidence_file, original_file }) => ({ slug: evidence.identity.slug, source_url: evidence.source_url, observed_at: evidence.observed_at,
        source_sha256: evidence.source_sha256, source_revision: evidence.source_revision, evidence_file, original_file })),
      accepted: [], publication_required: false, next_step: "Review every staged original and edit the held plan; use review:official-hours-batch against the private pending artifact. Reconcile approved results through the normal protected publication lane." });
  }
  return { dry_run: !write, source_revision: revision, collection_complete: index.collection_complete, selected: slugs,
    staged: result.staged, blocked: result.blocked, accepted: [], held_plan_decisions: result.plan.decisions.length, publication_required: false,
    ...(outputDirectory ? { output_directory: outputDirectory, artifact: resolve(outputDirectory, "pending-merchant-hours.json"), plan: resolve(outputDirectory, "review-plan.json") } : {}) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(stageOfficialListingHours(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
