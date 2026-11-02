/** One native MARC transfer with retained originals, or explicit offline ZIP replay.
 * Native: set MARC_REVIEW_EVIDENCE_DIR, then npm run build:marc-schedule.
 * Replay: --input-zip=FILE --observed-at=ORIGINAL_UTC --source-sha256=HASH
 *         --output=PRIVATE_NEW_FILE (all four required; never refreshes clocks).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createNativeSourceReviewEvidence } from "./lib/native-source-review-evidence";
import { buildMarcScheduleFromZip, GTFS_URL, MAX_MARC_ARCHIVE_BYTES } from "./lib/marc-schedule-build";

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(CHECKOUT, "src/data/marc-schedule.json");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type CurlResult = { exitCode: number; metadata: Record<string, unknown>; observedAt: string; stderr: string };
/** Parse only metadata emitted by the same transfer. Missing status stays unknown. */
export function marcCurlEvidence(result: CurlResult) {
  const rawStatus = result.metadata.http_code ?? result.metadata.response_code;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : null;
  return { requested_url: GTFS_URL, final_url: typeof result.metadata.url_effective === "string" ? result.metadata.url_effective : null,
    http_status: status, content_type: typeof result.metadata.content_type === "string" ? result.metadata.content_type : null,
    redirects: typeof result.metadata.num_redirects === "number" ? result.metadata.num_redirects : null,
    curl_exit_code: result.exitCode, observed_at: result.observedAt, stderr: result.stderr.slice(0, 2000) };
}

export function marcBuildArguments(args: string[]) {
  const options = new Map<string, string>();
  for (const arg of args) {
    const match = /^--(input-zip|observed-at|source-sha256|output)=(.+)$/.exec(arg);
    if (!match || options.has(match[1])) throw new Error("Unknown or repeated MARC build option.");
    options.set(match[1], match[2]);
  }
  const input = options.get("input-zip"), observedAt = options.get("observed-at"), sourceSha256 = options.get("source-sha256"), output = options.get("output");
  if (input) {
    if (!observedAt || !sourceSha256 || !output) throw new Error("Offline MARC replay needs input ZIP, original observed-at, expected source-sha256 and explicit private output.");
    const destination = join(realpathSync(dirname(resolve(output))), basename(output)), checkout = realpathSync(CHECKOUT);
    const inside = relative(checkout, destination);
    if (!inside || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))) throw new Error("Offline MARC output must stay outside the checkout; source application is a separate reviewed step.");
    return { input: resolve(input), original: { observedAt, sourceSha256 }, output: destination };
  }
  if (observedAt || sourceSha256 || output) throw new Error("Source clock/hash/private output options require an explicit retained input ZIP.");
  return null;
}

export function main(args = process.argv.slice(2)) {
  const replay = marcBuildArguments(args);
  if (replay) {
    const payload = buildMarcScheduleFromZip(replay.input, replay.original);
    writeFileSync(replay.output, JSON.stringify(payload, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Replayed retained MARC ZIP to ${replay.output}; observation ${replay.original.observedAt}; no source request.`);
    return;
  }
  const configuredDirectory = process.env.MARC_REVIEW_EVIDENCE_DIR;
  if (!configuredDirectory) throw new Error("Set MARC_REVIEW_EVIDENCE_DIR before the native transfer so its original cannot be discarded.");
  const directory = resolve(configuredDirectory);
  const revision = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: CHECKOUT, encoding: "utf8" }).trim();
  const evidence = createNativeSourceReviewEvidence(directory, {
    publisher: "marc-transit", checkout: CHECKOUT, sourceRevision: revision, sourceRun: process.env.GITHUB_RUN_ID, sourceAttempt: process.env.GITHUB_RUN_ATTEMPT,
    sources: [{ id: "marc-static-gtfs", urls: [GTFS_URL], selected: true }], maxResponses: 1,
    maxResponseBytes: MAX_MARC_ARCHIVE_BYTES, maxTotalBytes: MAX_MARC_ARCHIVE_BYTES,
  });
  const dir = mkdtempSync(join(tmpdir(), "marc-gtfs-")), zip = join(dir, "marc.zip");
  let completed = false;
  try {
    let exitCode = 0, stdout = "", stderr = "";
    try {
      // Preserve existing redirect behavior, one curl invocation, no retry.
      // The write-out belongs to this same transfer, not a second HEAD/GET.
      stdout = execFileSync("curl", ["--silent", "--show-error", "--location", "--max-time", "60",
        "--max-filesize", String(MAX_MARC_ARCHIVE_BYTES), "--output", zip, "--write-out", "%{json}", GTFS_URL],
      { encoding: "utf8", maxBuffer: 100_000 });
    } catch (error) {
      const failure = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      exitCode = failure.status ?? 1; stdout = String(failure.stdout ?? ""); stderr = String(failure.stderr ?? "");
    }
    const observedAt = new Date().toISOString();
    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch { /* Missing transfer metadata remains unknown. */ }
    const transport = marcCurlEvidence({ exitCode, metadata, observedAt, stderr });
    const bytes = existsSync(zip) ? readFileSync(zip) : null;
    // Transport diagnostics survive even when strict native identity rejects
    // the final URL, status is unknown, or the transfer/body is incomplete.
    writeFileSync(join(directory, "curl-transfer.json"), JSON.stringify({ ...transport,
      source_sha256: bytes ? digest(bytes) : null, bytes: bytes?.length ?? null,
      semantic_acceptance: false }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    if (transport.http_status !== null && transport.final_url) {
      try {
        evidence.capture("marc-static-gtfs", { requestedUrl: GTFS_URL, finalUrl: transport.final_url, method: "GET", status: transport.http_status,
          body: bytes, bodyState: "not_read", observedAt,
          context: { curl_exit_code: exitCode, content_type: transport.content_type ?? "UNKNOWN", redirects: transport.redirects ?? -1 } });
      } catch (error) {
        if (bytes && bytes.length <= MAX_MARC_ARCHIVE_BYTES) writeFileSync(join(directory, "rejected-transport-original.zip"), bytes, { flag: "wx", mode: 0o600 });
        throw error;
      }
    } else if (bytes && bytes.length <= MAX_MARC_ARCHIVE_BYTES) {
      writeFileSync(join(directory, "incomplete-transport-original.zip"), bytes, { flag: "wx", mode: 0o600 });
    }
    if (exitCode !== 0 || transport.http_status === null || transport.http_status < 200 || transport.http_status >= 300 || !bytes) throw new Error("MARC native transfer failed; retained evidence is held and no retry is made.");
    const payload = buildMarcScheduleFromZip(zip, { observedAt, sourceSha256: digest(bytes) });
    evidence.finish([{ sourceId: "marc-static-gtfs", status: "complete", observedAt }]); completed = true;
    writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
    evidence.bindOutputs(["src/data/marc-schedule.json"]);
    console.log(`Wrote ${OUT}: ${payload.stations} stations, ${payload.departures} departures; exact original retained.`);
  } catch (error) {
    if (!completed) {
      try { evidence.finish([{ sourceId: "marc-static-gtfs", status: "failed", observedAt: new Date().toISOString() }]); }
      catch { /* Capture failure already remains explicit and held in index. */ }
    }
    throw error;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
