import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";

vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: vi.fn() }));
vi.mock("@/lib/integrations/fcps", () => ({ getFcpsAlertsResult: vi.fn() }));
vi.mock("@/lib/integrations/mdot-chart", () => ({ getChartIncidentsFrederickResult: vi.fn() }));
vi.mock("@/lib/integrations/firstenergy", () => ({ getFrederickOutagesResult: vi.fn() }));

import { GET } from "@/app/api/pulse/status/route";

const emptyOutages = { total_out: 0, total_served: 0, munis: [] };

describe("GET /api/pulse/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getNwsAlertsResult).mockResolvedValue({ alerts: [], available: true });
    vi.mocked(getFcpsAlertsResult).mockResolvedValue({ data: [], available: true });
    vi.mocked(getChartIncidentsFrederickResult).mockResolvedValue({ data: [], available: true });
    vi.mocked(getFrederickOutagesResult).mockResolvedValue({ data: emptyOutages, available: true });
  });

  it("reports a source failure instead of presenting a quiet all-clear", async () => {
    vi.mocked(getFcpsAlertsResult).mockResolvedValue({ data: [], available: false });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
      ok: false,
    });
  });

  it("ignores Low traffic for the county alert but includes High traffic", async () => {
    vi.mocked(getChartIncidentsFrederickResult).mockResolvedValue({
      available: true,
      data: [{ severity: "Low" } as Awaited<ReturnType<typeof getChartIncidentsFrederickResult>>["data"][number]],
    });
    let response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
    });

    vi.mocked(getChartIncidentsFrederickResult).mockResolvedValue({
      available: true,
      data: [{ severity: "High" } as Awaited<ReturnType<typeof getChartIncidentsFrederickResult>>["data"][number]],
    });
    response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "alert",
      ok: true,
    });
  });

  it("does not count a normal-operations school notice as an alert", async () => {
    vi.mocked(getFcpsAlertsResult).mockResolvedValue({
      available: true,
      data: [{ status: "open" } as Awaited<ReturnType<typeof getFcpsAlertsResult>>["data"][number]],
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ active: false, count: 0, tone: "quiet" });
  });
});
