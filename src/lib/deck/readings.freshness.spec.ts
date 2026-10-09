import { beforeEach, describe, expect, it, vi } from "vitest";
const providers = vi.hoisted(() => ({ alerts: vi.fn(), traffic: vi.fn() }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: providers.alerts }));
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: async () => null }));
vi.mock("@/lib/integrations/mdot-chart", () => ({ getChartIncidentsFrederickResult: providers.traffic, chartRoad: () => "US 15" }));
vi.mock("@/lib/integrations/firstenergy", () => ({ getFrederickOutagesResult: async () => ({ available: false, data: { total_out: 0, munis: [] } }) }));
vi.mock("@/lib/integrations/fcps", () => ({ getFcpsAlertsResult: async () => ({ available: false, data: [] }) }));
vi.mock("@/lib/integrations/usgsWater", () => ({ getFrederickWaterSitesWithHistory: async () => [], readingTrend: () => null }));
vi.mock("@/lib/integrations/transitFrederick", () => ({ getFrederickTransitRoutes: async () => [] }));
vi.mock("@/lib/integrations/transitRealtime", () => ({ getLiveVehiclesWithNextStopResult: async () => ({ available: false, data: [] }) }));
vi.mock("@/lib/integrations/marcVehicles", () => ({ getMarcVehiclesResult: async () => ({ available: false, data: [] }) }));
vi.mock("@/lib/integrations/seeclickfix", () => ({ getFixItIssuesResult: async () => ({ status: "unavailable", data: [], openCount: 0, acknowledgedCount: 0 }) }));
vi.mock("@/lib/integrations/news", () => ({ getLocalHeadlines: async () => [] }));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: async () => ({ publicEvents: [] }) }));
import { getDeckKeys } from "./readings";
const NOW = new Date("2026-10-09T16:00:00.000Z");
beforeEach(() => { providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: NOW.toISOString() }); providers.traffic.mockResolvedValue({ available: true, data: [], asOf: NOW.toISOString() }); });
describe("Tools source evidence before shaping counts", () => {
  it("counts only unexpired NWS alerts and carries the real check and earliest count expiry", async () => {
    providers.alerts.mockResolvedValue({ available: true, checkedAt: NOW.toISOString(), alerts: [{ event: "Expired advisory", ends_at: "2026-10-09T15:59:59.000Z" }, { event: "Current advisory", ends_at: "2026-10-09T16:05:00.000Z" }] });
    const weather = (await getDeckKeys(NOW)).find((key) => key.id === "weather")!;
    expect(weather.faces[0]).toEqual({ value: "1", label: "active alert" });
    expect(weather).toMatchObject({ checkedAt: NOW.toISOString(), validUntil: "2026-10-09T16:05:00.000Z", status: "ok" });
  });
  it("keeps a cached empty NWS response unverified instead of Clear", async () => {
    providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: "2026-10-09T15:40:00.000Z" });
    const weather = (await getDeckKeys(NOW)).find((key) => key.id === "weather")!;
    expect(weather.status).toBe("unavailable");
    expect(weather.faces[0].value).not.toBe("Clear");
    expect(weather.checkedAt).toBe("2026-10-09T15:40:00.000Z");
  });
  it("retains a stale CHART count as evidence rather than publishing it as current", async () => {
    providers.traffic.mockResolvedValue({ available: true, asOf: "2026-10-09T15:40:00.000Z", data: [{ type: "Crash", description: "US 15 crash", location: "US 15" }] });
    const traffic = (await getDeckKeys(NOW)).find((key) => key.id === "traffic")!;
    expect(traffic).toMatchObject({ status: "unavailable", checkedAt: "2026-10-09T15:40:00.000Z" });
    expect(traffic.faces[0]).toEqual({ value: "1", label: "incident" });
  });
});
