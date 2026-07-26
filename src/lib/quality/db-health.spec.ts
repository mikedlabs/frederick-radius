import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { evaluateDbHealth } from "./db-health";

describe("evaluateDbHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports an explicit infrastructure anomaly when no database is configured", async () => {
    mocks.getSql.mockReturnValue(null);

    await expect(evaluateDbHealth()).resolves.toEqual({
      status: "unavailable",
      reason: "not_configured",
      anomalies: [
        expect.objectContaining({
          source: "database",
          kind: "infrastructure_unavailable",
        }),
      ],
    });
  });

  it("reports infrastructure unavailable when a required health query fails", async () => {
    const sql = vi.fn().mockRejectedValue(new Error("connection refused"));
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "query_failed",
      anomalies: [
        {
          source: "database",
          kind: "infrastructure_unavailable",
          detail: expect.stringContaining("required health query failed"),
        },
      ],
    });
    expect(sql).toHaveBeenCalled();
  });

  it("only reports available after both database probes complete", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ relname: "public_without_rls" }])
      .mockResolvedValueOnce([]);
    mocks.getSql.mockReturnValue(sql);

    const result = await evaluateDbHealth();

    expect(sql).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: "available",
      reason: null,
      anomalies: [
        expect.objectContaining({
          source: "public_without_rls",
          kind: "rls_unprotected",
        }),
      ],
    });
  });
});
