import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import type { MerchantHoursArtifact } from "../../src/lib/merchant-hours";

/** Collector and batch reviewer share one exclusive commit boundary. Never
 * replace a newer artifact, take over a held lock, or delete another attempt.
 */
export function commitMerchantHours(path: string, expected: string, artifact: MerchantHoursArtifact) {
  const lockPath = `${path}.review.lock`, temporary = `${path}.review.tmp`;
  const lock = openSync(lockPath, "wx", 0o600);
  let staged = false;
  try {
    if (readFileSync(path, "utf8") !== expected) throw new Error("The merchant artifact changed during review or collection; reconcile current evidence.");
    writeFileSync(temporary, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    staged = true;
    renameSync(temporary, path);
    staged = false;
  } finally {
    if (staged) unlinkSync(temporary);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
