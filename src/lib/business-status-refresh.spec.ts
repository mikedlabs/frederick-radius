import { describe, expect, it } from "vitest";
import {
  resolveRefreshedBusinessStatus,
  selectRotatingStatusTargets,
} from "./business-status-refresh";

describe("resolveRefreshedBusinessStatus", () => {
  it("uses the newer of the status and hours refresh artifacts", () => {
    expect(
      resolveRefreshedBusinessStatus(
        {
          is_operational: "closed_permanently",
          refreshed_at: "2026-07-20T12:00:00Z",
        },
        {
          business_status: "OPERATIONAL",
          refreshed_at: "2026-07-22T12:00:00Z",
        },
      ),
    ).toEqual({
      status: "operational",
      refreshed_at: "2026-07-22T12:00:00Z",
      source: "hours_refresh",
    });
  });

  it("does not let unknown or malformed refresh rows erase a usable status", () => {
    expect(
      resolveRefreshedBusinessStatus(
        {
          is_operational: "operational",
          refreshed_at: "2026-07-21T12:00:00Z",
        },
        {
          business_status: "UNKNOWN",
          refreshed_at: "2026-07-22T12:00:00Z",
        },
      )?.status,
    ).toBe("operational");

    expect(
      resolveRefreshedBusinessStatus(
        {
          is_operational: "closed_temporarily",
          refreshed_at: "not-a-date",
        },
        undefined,
      ),
    ).toBeUndefined();
  });
});

describe("selectRotatingStatusTargets", () => {
  const targets = ["a", "b", "c", "d", "e"];

  it("advances by one batch per cycle and wraps the tail", () => {
    expect(selectRotatingStatusTargets(targets, 2, 0)).toEqual(["a", "b"]);
    expect(selectRotatingStatusTargets(targets, 2, 1)).toEqual(["c", "d"]);
    expect(selectRotatingStatusTargets(targets, 2, 2)).toEqual(["e", "a"]);
  });

  it("returns every target once when the cap covers the catalog", () => {
    expect(selectRotatingStatusTargets(targets, 10, 7)).toEqual(targets);
  });
});
