import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("uses snapshot cadence for a pipeline-owned backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-freshness-"));
  const manifest = join(dir, "sources.yaml");
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    manifest,
    [
      "sources:",
      "  - id: mdot_chart",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly",
      "    snapshot_cadence: daily",
      `    last_success: ${twelveHoursAgo}`,
      "",
    ].join("\n"),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "pipeline/freshness_check.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, SOURCE_MANIFEST: manifest },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /within their snapshot policy/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails when a change-tracked upstream keeps returning frozen data", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-freshness-change-"));
  const manifest = join(dir, "sources.yaml");
  const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const frozen = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    manifest,
    [
      "sources:",
      "  - id: nws_forecast",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly",
      "    snapshot_cadence: daily",
      "    change_cadence: daily",
      `    last_success: ${recent}`,
      `    last_changed: ${frozen}`,
      "",
    ].join("\n"),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "pipeline/freshness_check.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, SOURCE_MANIFEST: manifest },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /payload unchanged since/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails closed on an unsupported snapshot cadence", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-freshness-policy-"));
  const manifest = join(dir, "sources.yaml");
  writeFileSync(
    manifest,
    [
      "sources:",
      "  - id: mdot_chart",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly",
      "    snapshot_cadence: dayly",
      `    last_success: ${new Date().toISOString()}`,
      "",
    ].join("\n"),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "pipeline/freshness_check.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, SOURCE_MANIFEST: manifest },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported snapshot cadence dayly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("normalizes an annotated refresh cadence only when no snapshot cadence exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-freshness-annotated-"));
  const manifest = join(dir, "sources.yaml");
  writeFileSync(
    manifest,
    [
      "sources:",
      "  - id: runtime-shaped-pipeline-source",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly (source owner note)",
      `    last_success: ${new Date().toISOString()}`,
      "",
    ].join("\n"),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "pipeline/freshness_check.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, SOURCE_MANIFEST: manifest },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails when generated snapshot state reports a far-future success", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-freshness-future-"));
  const policyManifest = join(dir, "policy.yaml");
  const stateManifest = join(dir, "state.yaml");
  const stale = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    policyManifest,
    [
      "sources:",
      "  - id: mdot_chart",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly",
      `    last_success: ${stale}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    stateManifest,
    [
      "sources:",
      "  - id: mdot_chart",
      "    status: active",
      "    collection: pipeline",
      "    refresh_cadence: hourly",
      "    last_success: 2099-01-01T00:00:00.000Z",
      "",
    ].join("\n"),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "pipeline/freshness_check.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SOURCE_POLICY_MANIFEST: policyManifest,
          SOURCE_STATE_MANIFEST: stateManifest,
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /snapshot state last_success .*future/);
    assert.match(result.stderr, /age .* exceeds 3h/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
