import assert from "node:assert/strict";
import test from "node:test";

import {
  basemapFailureMustStopBuild,
  PROTOMAPS_STABLE_FALLBACK_URL,
  resolveProtomapsPlanetBuild,
  resolvePmtilesRelease,
  selectNewestProtomapsBuild,
} from "./basemap-platform.mjs";

test("selects the published go-pmtiles archive for each supported build host", () => {
  assert.deepEqual(
    resolvePmtilesRelease({ version: "1.28.0", platform: "linux", arch: "x64" }),
    {
      archiveName: "go-pmtiles_1.28.0_Linux_x86_64.tar.gz",
      cacheKey: "linux-x64",
      format: "tar.gz",
      url: "https://github.com/protomaps/go-pmtiles/releases/download/v1.28.0/go-pmtiles_1.28.0_Linux_x86_64.tar.gz",
    },
  );
  assert.equal(
    resolvePmtilesRelease({ version: "1.28.0", platform: "linux", arch: "arm64" })
      .archiveName,
    "go-pmtiles_1.28.0_Linux_arm64.tar.gz",
  );
  assert.equal(
    resolvePmtilesRelease({ version: "1.28.0", platform: "darwin", arch: "x64" })
      .archiveName,
    "go-pmtiles-1.28.0_Darwin_x86_64.zip",
  );
  assert.deepEqual(
    resolvePmtilesRelease({ version: "1.28.0", platform: "darwin", arch: "arm64" }),
    {
      archiveName: "go-pmtiles-1.28.0_Darwin_arm64.zip",
      cacheKey: "darwin-arm64",
      format: "zip",
      url: "https://github.com/protomaps/go-pmtiles/releases/download/v1.28.0/go-pmtiles-1.28.0_Darwin_arm64.zip",
    },
  );
});

test("rejects an unsupported platform before attempting a download", () => {
  assert.throws(
    () =>
      resolvePmtilesRelease({
        version: "1.28.0",
        platform: "win32",
        arch: "x64",
      }),
    /no configured build for win32\/x64/,
  );
});

test("CI and Vercel builds fail closed while ordinary local work can degrade", () => {
  assert.equal(basemapFailureMustStopBuild({}), false);
  assert.equal(basemapFailureMustStopBuild({ CI: "false", VERCEL: "0" }), false);
  assert.equal(basemapFailureMustStopBuild({ CI: "true" }), true);
  assert.equal(basemapFailureMustStopBuild({ CI: "1" }), true);
  assert.equal(basemapFailureMustStopBuild({ VERCEL: "1" }), true);
});

test("selects the newest compatible build from the official index", () => {
  assert.equal(
    selectNewestProtomapsBuild([
      { key: "20260812.pmtiles", version: "4.15.2" },
      { key: "20260814.pmtiles", version: "5.0.0" },
      { key: "not-a-build.pmtiles", version: "4.15.2" },
      { key: "20260813.pmtiles", version: "4.15.2" },
    ]),
    "https://build.protomaps.com/20260813.pmtiles",
  );
  assert.equal(selectNewestProtomapsBuild([]), null);
});

test("uses an explicit HTTPS build override without reading the live index", async () => {
  const result = await resolveProtomapsPlanetBuild({
    env: {
      PROTOMAPS_PLANET_BUILD_URL:
        "https://tiles.frederickradius.app/frederick-county.pmtiles",
    },
    fetchImpl() {
      throw new Error("the index should not be read");
    },
  });

  assert.deepEqual(result, {
    source: "environment override",
    url: "https://tiles.frederickradius.app/frederick-county.pmtiles",
  });
});

test("falls back to a retained patch build when the live index is unavailable", async () => {
  const result = await resolveProtomapsPlanetBuild({
    env: {},
    async fetchImpl() {
      throw new Error("offline");
    },
  });

  assert.equal(result.url, PROTOMAPS_STABLE_FALLBACK_URL);
  assert.match(result.source, /stable fallback/);
});
