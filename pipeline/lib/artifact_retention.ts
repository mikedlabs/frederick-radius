import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { extname, join } from "node:path";

export type CleanFormat = "json" | "geojson";

type RetentionOptions = {
  dataRoot: string;
  managedSourceIds: ReadonlySet<string>;
  successfulFormats: ReadonlyMap<string, CleanFormat>;
  today: string;
};

const SUCCESSFUL_RAW = /^\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Keep the snapshot branch bounded without throwing away recovery evidence.
 *
 * Clean outputs survive a failed refresh. Once a source succeeds, an obsolete
 * alternate extension is removed. Raw storage keeps one last schema-valid
 * payload per managed source plus the current day's bounded diagnostics.
 */
export function prunePipelineArtifacts({
  dataRoot,
  managedSourceIds,
  successfulFormats,
  today,
}: RetentionOptions): void {
  const cleanRoot = join(dataRoot, "clean");
  if (existsSync(cleanRoot)) {
    for (const entry of readdirSync(cleanRoot)) {
      const path = join(cleanRoot, entry);
      if (!statSync(path).isFile()) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
      const extension = extname(entry).slice(1);
      const id = entry.slice(0, -(extension.length + 1));
      if (
        !["json", "geojson"].includes(extension) ||
        !managedSourceIds.has(id) ||
        (successfulFormats.has(id) && successfulFormats.get(id) !== extension)
      ) {
        rmSync(path, { force: true });
      }
    }
  }

  const rawRoot = join(dataRoot, "raw");
  if (!existsSync(rawRoot)) return;

  for (const sourceId of readdirSync(rawRoot)) {
    const sourceRoot = join(rawRoot, sourceId);
    if (!statSync(sourceRoot).isDirectory() || !managedSourceIds.has(sourceId)) {
      rmSync(sourceRoot, { recursive: true, force: true });
      continue;
    }

    const files = readdirSync(sourceRoot).filter((entry) =>
      statSync(join(sourceRoot, entry)).isFile(),
    );
    const newestSuccess = files
      .filter((entry) => SUCCESSFUL_RAW.test(entry))
      .sort()
      .at(-1);

    for (const entry of files) {
      const keepLastGood = entry === newestSuccess;
      const keepCurrentDiagnostic =
        entry.startsWith(`${today}.`) && entry !== `${today}.json`;
      if (!keepLastGood && !keepCurrentDiagnostic) {
        rmSync(join(sourceRoot, entry), { force: true });
      }
    }

    for (const entry of readdirSync(sourceRoot)) {
      const path = join(sourceRoot, entry);
      if (!statSync(path).isFile()) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  }
}
