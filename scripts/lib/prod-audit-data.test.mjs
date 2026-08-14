import assert from "node:assert/strict";
import test from "node:test";
import {
  publicEventReadGate,
  publicFoodTruckBeaconGate,
  publicFoodTruckScheduleGate,
} from "./prod-audit-data.mjs";

function eventRows(count, sourceCount = 8) {
  return Array.from({ length: count }, (_, index) => ({
    slug: `event-${index}`,
    source: `source-${index % sourceCount}`,
  }));
}

test("event public-read gate rejects the small archive fallback", () => {
  const gate = publicEventReadGate({
    events: eventRows(12, 3),
    sourceHealth: {
      degraded: true,
      unavailable: ["event archive"],
      archive: { state: "unavailable" },
    },
  });

  assert.equal(gate.passes, false);
  assert.equal(gate.count, 12);
  assert.match(gate.failures.join(" "), /minimum is 20/);
  assert.match(gate.warnings.join(" "), /event archive/);
});

test("event public-read gate rejects failed archive evidence despite a high row count", () => {
  const gate = publicEventReadGate({
    events: eventRows(40),
    sourceHealth: {
      degraded: true,
      unavailable: ["event archive"],
      archive: { state: "failed" },
    },
  });

  assert.equal(gate.passes, false);
  assert.match(gate.failures.join(" "), /archive is failed/);
  assert.match(gate.warnings.join(" "), /event archive/);
});

for (const state of ["stale", "invalid", "unavailable"]) {
  test(`event public-read gate rejects ${state} archive evidence`, () => {
    const gate = publicEventReadGate({
      events: eventRows(40),
      sourceHealth: {
        degraded: true,
        unavailable: ["event archive"],
        archive: { state },
      },
    });

    assert.equal(gate.passes, false);
    assert.match(gate.failures.join(" "), new RegExp(`archive is ${state}`));
  });
}

test("event public-read gate rejects a payload without archive evidence", () => {
  const gate = publicEventReadGate({
    events: eventRows(40),
    sourceHealth: { degraded: false, unavailable: [] },
  });

  assert.equal(gate.passes, false);
  assert.match(gate.failures.join(" "), /no bounded archive-health evidence/);
});

test("event public-read gate keeps provider-only partial archive rows available", () => {
  const gate = publicEventReadGate({
    events: eventRows(40),
    sourceHealth: {
      degraded: true,
      unavailable: ["event archive providers"],
      archive: { state: "provider_partial" },
    },
  });

  assert.equal(gate.passes, true);
  assert.equal(gate.sourceCount, 8);
  assert.match(gate.warnings.join(" "), /event archive providers/);
});

test("event public-read gate reports a non-archive partial source as a warning", () => {
  const gate = publicEventReadGate({
    events: eventRows(24),
    sourceHealth: {
      degraded: true,
      unavailable: ["one venue"],
      archive: { state: "current" },
    },
  });

  assert.equal(gate.passes, true);
  assert.deepEqual(gate.warnings, [
    "public read reports unavailable sources: one venue",
  ]);
});

test("event public-read gate rejects a broad count from too few sources", () => {
  const gate = publicEventReadGate({
    events: eventRows(120, 2),
    sourceHealth: {
      degraded: false,
      unavailable: [],
      archive: { state: "current" },
    },
  });

  assert.equal(gate.passes, false);
  assert.equal(gate.sourceCount, 2);
  assert.match(gate.failures.join(" "), /minimum is 8/);
});

test("event public-read gate warns when one source dominates the result", () => {
  const events = eventRows(20);
  for (let index = 0; index < 80; index += 1) {
    events.push({ slug: `dominant-${index}`, source: "dominant-source" });
  }
  const gate = publicEventReadGate({
    events,
    sourceHealth: {
      degraded: false,
      unavailable: [],
      archive: { state: "current" },
    },
  });

  assert.equal(gate.passes, true);
  assert.match(gate.warnings.join(" "), /80\.0%/);
});

test("food-truck schedule gate verifies freshness and source coverage", () => {
  const nowMs = Date.parse("2026-08-14T14:00:00.000Z");
  const gate = publicFoodTruckScheduleGate({
    ok: true,
    status: "current",
    generatedAt: "2026-08-14T12:00:00.000Z",
    counts: {
      stops: 10,
      sources: 5,
      healthySources: 5,
      failedSources: 0,
      suspiciousSources: 0,
    },
  }, { nowMs });

  assert.equal(gate.passes, true);
  assert.equal(gate.stopCount, 10);
  assert.equal(gate.ageHours, 2);
});

test("food-truck schedule gate rejects stale or partially failed coverage", () => {
  const nowMs = Date.parse("2026-08-14T14:00:00.000Z");
  const gate = publicFoodTruckScheduleGate({
    ok: false,
    status: "degraded",
    generatedAt: "2026-08-12T00:00:00.000Z",
    counts: {
      stops: 0,
      sources: 5,
      healthySources: 4,
      failedSources: 1,
      suspiciousSources: 1,
    },
  }, { nowMs });

  assert.equal(gate.passes, false);
  assert.match(gate.failures.join(" "), /degraded/);
  assert.match(gate.failures.join(" "), /source-health/);
  assert.match(gate.failures.join(" "), /hours old/);
  assert.equal(gate.warnings.length, 1);
});

test("zero live food-truck beacons are a valid readable state", () => {
  const gate = publicFoodTruckBeaconGate({ ok: true, pins: [] });
  assert.deepEqual(gate, { passes: true, failures: [], count: 0 });
});
