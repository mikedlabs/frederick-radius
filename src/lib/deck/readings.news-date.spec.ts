import { beforeEach, describe, expect, it, vi } from "vitest";
const providers = vi.hoisted(() => ({ alerts: vi.fn(), traffic: vi.fn(), news: vi.fn() }));
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
vi.mock("@/lib/integrations/news", () => ({ getLocalHeadlines: providers.news }));
vi.mock("@/lib/loaders/unifiedEvents", () => ({ assembleUnifiedEvents: async () => ({ publicEvents: [] }) }));
import { getDeckKeys } from "./readings";
const NOW = new Date("2026-10-09T16:00:00.000Z");
beforeEach(() => { providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: NOW.toISOString() }); providers.traffic.mockResolvedValue({ available: true, data: [], asOf: NOW.toISOString() }); });
describe("Deck headline publication trail", () => {
  it.each([
    ["2026-10-09T17:00:00.000Z", "Publication date unavailable"],
    [null, "Publication date unavailable"],
    ["invalid", "Publication date unavailable"],
    ["2026-10-09T15:00:00.000Z", "1h ago"],
  ])("uses an explicit trail for publication %s", async (published_at, expected) => {
    providers.news.mockResolvedValue([{ title: "County publishes its meeting schedule", source: "Local publisher", url: "https://news.google.com/rss/articles/fixture", published_at }]);
    const news = (await getDeckKeys(NOW)).find((key) => key.id === "news")!;
    expect(news.detail?.[0].trail).toBe(expected);
  });
});
