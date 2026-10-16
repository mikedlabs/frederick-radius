import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceRegistryArtifact } from "@/../scripts/build-source-registry";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "radius source registry "));
  directories.push(directory);
  mkdirSync(join(directory, "data"));
  mkdirSync(join(directory, "src", "data"), { recursive: true });
  return directory;
}
const manifest = `sources:
  - id: official_city
    name: City official newsroom
    owner: City of Frederick
    url: https://www.cityoffrederickmd.gov/Rss.aspx
    status: active
    collection: runtime
    refresh_cadence: hourly
`;
function run(directory: string) {
  // Use the actual generator file in the owner's checkout, whose path includes
  // spaces; only the temporary fixture's source projection can be written.
  return spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), resolve("scripts/build-source-registry.ts")], {
    cwd: directory, encoding: "utf8", timeout: 10_000,
  });
}

describe("source registry CLI in paths containing spaces", () => {
  it("executes the documented generator and writes its exact manifest projection", () => {
    const directory = fixture();
    writeFileSync(join(directory, "data", "sources.yaml"), manifest);
    const result = run(directory);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Wrote 1 source rows");
    expect(JSON.parse(readFileSync(join(directory, "src", "data", "source-registry.generated.json"), "utf8"))).toEqual(buildSourceRegistryArtifact(manifest));
  });

  it("exits nonzero for an invalid manifest and preserves the last projection", () => {
    const directory = fixture();
    writeFileSync(join(directory, "data", "sources.yaml"), manifest.replace("status: active", "status: actve"));
    const target = join(directory, "src", "data", "source-registry.generated.json");
    writeFileSync(target, "previous projection\n");
    const result = run(directory);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported source status "actve"');
    expect(readFileSync(target, "utf8")).toBe("previous projection\n");
  });
});
