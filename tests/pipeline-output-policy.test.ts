import assert from "node:assert/strict";
import test from "node:test";
import { normalizedRowCount } from "../pipeline/lib/output_policy";

test("counts normalized feature collections and tabular payloads", () => {
  assert.equal(
    normalizedRowCount({
      format: "geojson",
      data: { type: "FeatureCollection", features: [] },
    }),
    0,
  );
  assert.equal(
    normalizedRowCount({
      format: "json",
      data: { periods: [{ number: 1 }, { number: 2 }] },
    }),
    2,
  );
  assert.equal(normalizedRowCount({ format: "json", data: [1, 2, 3] }), 3);
});

test("returns null when a normalized payload has no countable row boundary", () => {
  assert.equal(
    normalizedRowCount({ format: "json", data: { status: "ok" } }),
    null,
  );
});
