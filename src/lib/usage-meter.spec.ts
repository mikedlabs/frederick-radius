import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { meterUsage } from "./usage-meter";

describe("usage meter increments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
    mocks.getSql.mockReturnValue(mocks.sql);
  });

  it("preserves the default one-unit increment", () => {
    meterUsage("mapbox_isochrone");

    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]?.slice(1)).toEqual([
      "mapbox_isochrone",
      1,
      1,
    ]);
  });

  it("records Matrix elements as a positive bounded increment", () => {
    meterUsage("mapbox_matrix", 7);

    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]?.slice(1)).toEqual([
      "mapbox_matrix",
      7,
      7,
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "ignores an invalid increment (%s)",
    (increment) => {
      meterUsage("mapbox_matrix", increment);

      expect(mocks.getSql).not.toHaveBeenCalled();
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );
});
