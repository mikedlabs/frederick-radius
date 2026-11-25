import { beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ alerts: vi.fn(), schools: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }));
vi.mock("react", () => ({ cache: (load: unknown) => load }));
vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: providers.alerts }));
vi.mock("@/lib/integrations/fcps", async (original) => ({
  ...await original<typeof import("@/lib/integrations/fcps")>(), getFcpsAlertsResult: providers.schools,
}));
vi.mock("@/lib/integrations/mdot-chart", () => ({ getChartIncidentsFrederickResult: async () => ({ available: true, data: [], asOf: "2026-10-09T16:00:00Z" }) }));
vi.mock("@/lib/integrations/scannerIncidents", () => ({ getGeocodedScannerIncidentsResult: async () => ({ available: true, data: [], rawCount: 0, asOf: "2026-10-09T15:59:00.000Z", asOfBasis: "retrieval" }) }));
vi.mock("@/lib/integrations/firstenergy", () => ({ getFrederickOutagesResult: async () => ({ available: true, data: { total_out: 0, total_served: 1, munis: [] }, asOf: "2026-10-09T16:00:00Z" }) }));
vi.mock("@/lib/integrations/pulsepoint", () => ({ getPulsePointIncidentsResult: async () => ({ configured: false, available: false, data: [] }) }));
vi.mock("@/lib/integrations/airnow", () => ({
  getAirQuality: async () => [{ category: { id: 1 } }],
  isFreshAqiObservation: () => true,
  airQualityObservedAt: () => new Date("2026-10-09T16:00:00Z"),
  pickWorstAqi: () => null,
}));
import { getCurrentSituationSnapshot } from "./currentSituation";

const NOW = "2026-10-09T16:00:00.000Z";
describe("shared county NWS source time", () => {
  beforeEach(() => {
    providers.alerts.mockReset();
    providers.schools.mockReset().mockResolvedValue({ available: true, data: [], checkedAt: "2026-10-09T15:59:00.000Z" });
  });
  it("keeps the school's original check and expires an earlier closure even while the feed check remains fresh", async () => {
    providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: NOW });
    providers.schools.mockResolvedValue({ available: true, checkedAt: "2026-10-09T15:59:00.000Z",
      data: [{ status: "closed", published_at: "2026-10-08T09:59:59.000Z" }] });
    const snapshot = await getCurrentSituationSnapshot({ now: NOW });
    expect(snapshot.sources.schools).toMatchObject({ data: [], asOf: "2026-10-09T15:59:00.000Z", asOfBasis: "retrieval" });
    expect(snapshot.summary.status).toBe("quiet");
  });
  it("does not turn a cached empty NWS response into a fresh quiet check", async () => {
    providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: "2026-10-09T15:40:00.000Z" });
    const snapshot = await getCurrentSituationSnapshot({ now: NOW });
    expect(snapshot.sources.weather).toMatchObject({ asOf: "2026-10-09T15:40:00.000Z", asOfBasis: "retrieval", freshness: "stale" });
    expect(snapshot.summary.coverage).toBe("partial");
    expect(snapshot.summary.status).toBe("unknown");
  });
  it.each([undefined, "invalid", "2026-10-09T16:03:00.000Z"])("refuses quiet clearance for unverifiable NWS checkedAt %j", async (checkedAt) => {
    providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt });
    const snapshot = await getCurrentSituationSnapshot({ now: NOW });
    expect(snapshot.sources.weather.freshness).not.toBe("fresh");
    expect(snapshot.summary.status).toBe("unknown");
  });
  it("retains a genuinely current empty check", async () => {
    providers.alerts.mockResolvedValue({ available: true, alerts: [], checkedAt: NOW });
    const snapshot = await getCurrentSituationSnapshot({ now: NOW });
    expect(snapshot.sources.weather).toMatchObject({ asOf: NOW, freshness: "fresh" });
    expect(snapshot.summary.status).toBe("quiet");
    expect(snapshot.roads.live.scannerCheckedAt).toBe("2026-10-09T15:59:00.000Z");
  });
});
