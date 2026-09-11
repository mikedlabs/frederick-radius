import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeFreshnessState,
  type FreshnessSourceRow,
} from "../pipeline/lib/freshness_state";

function source(
  overrides: Partial<FreshnessSourceRow> & Pick<FreshnessSourceRow, "id">,
): FreshnessSourceRow {
  return {
    status: "active",
    collection: "pipeline",
    refresh_cadence: "hourly",
    last_success: null,
    ...overrides,
  };
}

test("imports newer timestamps without restoring stale snapshot policy", () => {
  const rows = mergeFreshnessState(
    [
      source({
        id: "nws_alerts",
        snapshot_cadence: "daily",
        last_success: "2026-07-23T04:00:00.000Z",
      }),
    ],
    [
      source({
        id: "nws_alerts",
        snapshot_cadence: "hourly",
        status: "paused",
        last_success: "2026-07-31T12:00:00.000Z",
      }),
    ],
    new Date("2026-08-01T13:00:00.000Z"),
  );

  assert.equal(rows[0]?.snapshot_cadence, "daily");
  assert.equal(rows[0]?.status, "active");
  assert.equal(rows[0]?.last_success, "2026-07-31T12:00:00.000Z");
});

test("does not replace a newer trusted timestamp with older snapshot state", () => {
  const rows = mergeFreshnessState(
    [
      source({
        id: "mdot_chart",
        last_success: "2026-08-01T12:00:00.000Z",
        last_changed: "2026-08-01T10:00:00.000Z",
      }),
    ],
    [
      source({
        id: "mdot_chart",
        last_success: "2026-07-31T12:00:00.000Z",
        last_changed: "2026-07-31T10:00:00.000Z",
      }),
    ],
    new Date("2026-08-01T13:00:00.000Z"),
  );

  assert.equal(rows[0]?.last_success, "2026-08-01T12:00:00.000Z");
  assert.equal(rows[0]?.last_changed, "2026-08-01T10:00:00.000Z");
});

test("rejects far-future generated state instead of masking a stale policy timestamp", () => {
  const rows = mergeFreshnessState(
    [
      source({
        id: "mdot_chart",
        last_success: "2026-07-01T12:00:00.000Z",
        last_changed: "2026-07-01T10:00:00.000Z",
      }),
    ],
    [
      source({
        id: "mdot_chart",
        last_success: "2099-01-01T00:00:00.000Z",
        last_changed: "2099-01-01T00:00:00.000Z",
      }),
    ],
    new Date("2026-08-01T12:00:00.000Z"),
  );

  assert.equal(rows[0]?.last_success, "2026-07-01T12:00:00.000Z");
  assert.equal(rows[0]?.last_changed, "2026-07-01T10:00:00.000Z");
});
