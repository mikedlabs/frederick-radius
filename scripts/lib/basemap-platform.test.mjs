import assert from "node:assert/strict";
import test from "node:test";

import {
  basemapFailureMustStopBuild,
  resolvePmtilesRelease,
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
