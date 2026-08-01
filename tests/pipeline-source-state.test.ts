import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";
import { seedPriorSourceState } from "../pipeline/lib/source_state";

test("carries forward only newer last-success timestamps", () => {
  const dir = mkdtempSync(join(tmpdir(), "radius-source-state-"));
  const priorManifest = join(dir, "sources.yaml");
  writeFileSync(
    priorManifest,
    [
      "sources:",
      "  - id: mdot_chart",
      "    last_success: 2026-07-31T12:01:21.843Z",
      "    last_changed: 2026-07-31T12:01:21.843Z",
      "    last_payload_sha256: prior-hash",
      "  - id: newer-on-main",
      "    last_success: 2026-07-01T00:00:00.000Z",
      "  - id: removed-source",
      "    last_success: 2026-07-31T00:00:00.000Z",
      "",
    ].join("\n"),
  );
  const current = parseDocument(
    [
      "sources:",
      "  - id: mdot_chart",
      "    last_success: 2026-07-23T04:55:35.450Z",
      "  - id: newer-on-main",
      "    last_success: 2026-07-30T00:00:00.000Z",
      "",
    ].join("\n"),
  );

  try {
    assert.equal(seedPriorSourceState(current, priorManifest), 1);
    const rows = (current.toJS() as {
      sources: Array<{
        id: string;
        last_success: string;
        last_changed?: string;
        last_payload_sha256?: string;
      }>;
    }).sources;
    assert.equal(rows[0]?.last_success, "2026-07-31T12:01:21.843Z");
    assert.equal(rows[0]?.last_changed, "2026-07-31T12:01:21.843Z");
    assert.equal(rows[0]?.last_payload_sha256, "prior-hash");
    assert.equal(rows[1]?.last_success, "2026-07-30T00:00:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
