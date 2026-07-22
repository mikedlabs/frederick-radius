import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFrederickOutages,
  getFrederickOutagesResult,
} from "@/lib/integrations/firstenergy";

const state = {
  updatedAt: 1_784_674_968_000,
  stormcenterDeploymentId: "deployment-123",
  data: { interval_generation_data: "data/current-123" },
};

const config = {
  config: {
    reports: {
      data: {
        interval_generation_data: [
          { areaType: "wvmuni", source: "public/reports/wv_report.json" },
          { areaType: "mdmuni", source: "public/reports/md_report.json" },
        ],
      },
    },
  },
};

const report = {
  file_data: {
    areas: [
      { key: "county", name: "WASHINGTON", cust_a: { val: 5 }, cust_s: 10_000 },
      {
        key: "county",
        name: "FREDERICK",
        cust_a: { val: 29 },
        cust_s: 119_844,
        percent_cust_a: { val: 0.02 },
        areas: [
          { key: "mdmuni", name: "URBANA", cust_a: { val: 12 }, cust_s: 549 },
          { key: "mdmuni", name: "THURMONT", cust_a: { val: 0 }, cust_s: 2_714 },
        ],
      },
    ],
  },
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FirstEnergy KUBRA outages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discovers the current Maryland report and parses Frederick County", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(report));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFrederickOutagesResult();

    expect(result).toEqual({
      available: true,
      asOf: "2026-07-21T23:02:48.000Z",
      data: {
        total_out: 29,
        total_served: 119_844,
        county: {
          area: "FREDERICK",
          customers_out: 29,
          customers_served: 119_844,
          percentage: 0.02,
          scope: "county",
        },
        munis: [
          {
            area: "URBANA",
            customers_out: 12,
            customers_served: 549,
            percentage: 0,
            scope: "muni",
          },
          {
            area: "THURMONT",
            customers_out: 0,
            customers_served: 2_714,
            percentage: 0,
            scope: "muni",
          },
        ],
      },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("/configuration/deployment-123");
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      "https://kubra.io/data/current-123/public/reports/md_report.json",
    );
  });

  it("treats a zero-outage Frederick record as available", async () => {
    const noOutages = structuredClone(report);
    const frederick = noOutages.file_data.areas[1];
    frederick.cust_a = { val: 0 };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(noOutages));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFrederickOutagesResult();
    expect(result.available).toBe(true);
    expect(result.data.total_out).toBe(0);
  });

  it("marks HTTP failures and malformed reports unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 503)));
    await expect(getFrederickOutagesResult()).resolves.toEqual({
      data: { total_out: 0, total_served: 0, munis: [] },
      available: false,
    });

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response({ file_data: { areas: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await getFrederickOutagesResult()).available).toBe(false);
  });

  it("keeps the existing summary wrapper compatible", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(report));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFrederickOutages();
    expect(result.total_out).toBe(29);
    expect(result.munis).toHaveLength(2);
  });
});
