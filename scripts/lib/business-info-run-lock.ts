import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

type Commit = (value: unknown) => void;
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
function durableFile(path: string, bytes: Buffer) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function durableDirectory(path: string) {
  const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
}
/** Cooperative lock for the SAME checkout only. A held lock is a visible error,
 * never a reason to skip work or start a provider. This does not lock GitHub,
 * other worktrees, or programs that do not participate. */
export async function withBusinessInfoRunLock<T>(target: string, callback: (commit: Commit) => Promise<T>): Promise<T> {
  const path = resolve(target), root = resolve(dirname(path), "../.."), lockPath = `${path}.review.lock`;
  if (basename(path) !== "business-info.json" || path !== join(root, "src/data/business-info.json")) throw new Error("Expected the exact business-info target.");
  for (const parent of [join(root, "src"), join(root, "src/data")]) {
    const stat = lstatSync(parent); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Business-info parent must be a non-symlink directory.");
  }
  const targetStat = lstatSync(path);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error("Business-info target must be a regular file.");
  const lock = openSync(lockPath, "wx", 0o600), token = randomUUID();
  let holdDir: string | undefined, held = false, renamed = false, committed = false;
  try {
    writeFileSync(lock, token);
    // A previously staged candidate must be resolved before any source call.
    try { lstatSync(`${path}.review.tmp`); throw new Error("Existing staged business-info evidence requires review before collection."); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    const baseline = readFileSync(path);
    const configured = process.env.BUSINESS_INFO_CONFLICT_PARENT || process.env.RUNNER_TEMP || tmpdir();
    if (!isAbsolute(configured)) throw new Error("Business-info hold parent must be absolute.");
    const parent = realpathSync(configured), actualRoot = realpathSync(root), rel = relative(actualRoot, parent);
    if (rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))) throw new Error("Business-info hold parent must be outside the checkout.");
    // Reserve a fresh private location before the callback can fetch or spend.
    holdDir = mkdtempSync(join(parent, "radius-business-info-hold-"));
    durableDirectory(parent);
    const commit: Commit = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Business-info candidate must be an object.");
      const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      try {
        if (renamed) throw new Error("Business-info was already written; do not retry.");
        const stat = lstatSync(path);
        if (readFileSync(lockPath, "utf8") !== token || !stat.isFile() || stat.isSymbolicLink() || !readFileSync(path).equals(baseline)) throw new Error("Business-info target or writer lock changed.");
        const staged = `${path}.review.tmp`;
        durableFile(staged, next);
        // Repeat the baseline/lock check immediately before rename. This remains
        // cooperative, not a CAS against an editor that ignores the lock.
        if (readFileSync(lockPath, "utf8") !== token || !readFileSync(path).equals(baseline)) throw new Error("Business-info changed before commit.");
        // Durably retain the candidate and an honestly uncertain receipt BEFORE
        // rename. A crash before the next receipt is not proof of success/failure.
        durableFile(join(holdDir!, "candidate.json"), next); held = true;
        durableFile(join(holdDir!, "commit-prepared.json"), Buffer.from(`${JSON.stringify({ schema_version: 1, state: "commit_prepared_outcome_unknown_do_not_retry", baseline_sha256: hash(baseline), candidate_sha256: hash(next), prepared_at: new Date().toISOString(), original_provider_responses_retained: false }, null, 2)}\n`));
        durableDirectory(holdDir!);
        renameSync(staged, path);
        renamed = true;
        durableDirectory(dirname(path));
        durableFile(join(holdDir!, "commit-result.json"), Buffer.from(`${JSON.stringify({ schema_version: 1, state: "committed_local_not_published", baseline_sha256: hash(baseline), candidate_sha256: hash(next), committed_at: new Date().toISOString(), original_provider_responses_retained: false }, null, 2)}\n`));
        durableDirectory(holdDir!); committed = true;
      } catch (cause) {
        const candidate = join(holdDir!, "candidate.json"), receipt = join(holdDir!, "receipt.json");
        try {
          held = true;
          if (!existsSync(candidate)) durableFile(candidate, next);
          durableFile(receipt, Buffer.from(`${JSON.stringify({ schema_version: 1, state: renamed ? "write_outcome_uncertain_do_not_retry" : "held_derived_candidate_not_accepted", baseline_sha256: hash(baseline), candidate_sha256: hash(next), held_at: new Date().toISOString(), original_provider_responses_retained: false }, null, 2)}\n`));
          durableDirectory(holdDir!);
        } catch (error) {
          held = true;
          throw new Error(`Business-info changed; derived candidate preservation is incomplete at ${holdDir}. Do not retry or overwrite.`, { cause: error });
        }
        throw new Error(renamed ? `Business-info write outcome is uncertain at ${holdDir}. Do not retry.` : `Business-info commit held; derived candidate held at ${holdDir}. Review before applying.`, { cause });
      }
    };
    try { return await callback(commit); }
    catch (cause) {
      if (!committed) throw cause;
      // The file already changed even though subsequent caller work failed.
      // Preserve the successful commit receipt and make the failure explicit.
      try { durableFile(join(holdDir!, "post-commit-failure.json"), Buffer.from(`${JSON.stringify({ schema_version: 1, state: "committed_local_then_callback_failed_do_not_retry", failed_at: new Date().toISOString() }, null, 2)}\n`)); durableDirectory(holdDir!); }
      catch (error) { throw new Error(`Business-info already committed; later failure and receipt persistence uncertain at ${holdDir}. Do not retry.`, { cause: error }); }
      throw new Error(`Business-info already committed; later work failed. Review ${holdDir} before retrying.`, { cause });
    }
  } finally {
    closeSync(lock);
    // Never delete a lock replaced by another actor.
    try { if (readFileSync(lockPath, "utf8") === token) unlinkSync(lockPath); } catch { /* Preserve uncertainty. */ }
    if (holdDir && !held && existsSync(holdDir)) rmdirSync(holdDir);
  }
}
