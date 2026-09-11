import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

function declaredMapLibreVersion(): string {
  const range = packageJson.dependencies["maplibre-gl"];
  const version = range.match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) throw new Error(`Unrecognized maplibre-gl range: ${range}`);
  return version;
}

describe("vendored MapLibre runtime", () => {
  it("keeps the package, worker, and shared module on one version", () => {
    const version = declaredMapLibreVersion();
    const worker = readFileSync(
      resolve(process.cwd(), "public/basemap/maplibre-gl-worker.mjs"),
      "utf8",
    );
    const shared = readFileSync(
      resolve(process.cwd(), "public/basemap/maplibre-gl-shared.mjs"),
      "utf8",
    );

    expect(worker).toContain(`/v${version}/LICENSE.txt`);
    expect(worker).toContain('from"./maplibre-gl-shared.mjs"');
    expect(shared).toContain(`/v${version}/LICENSE.txt`);
  });
});
