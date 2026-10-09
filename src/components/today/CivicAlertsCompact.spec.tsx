import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { NpsAlert } from "@/lib/integrations/nps";
import CivicAlerts from "./CivicAlerts";

const providers = vi.hoisted(() => ({
  situation: vi.fn(), roads: vi.fn(), official: vi.fn(), nps: vi.fn(),
}));
vi.mock("@/lib/live/currentSituation", () => ({ getCurrentSituationSnapshot: providers.situation }));
vi.mock("@/lib/live/roadIntelligence", () => ({ getRoadIntelligenceSnapshot: providers.roads }));
vi.mock("@/lib/live/officialSignals", () => ({ getOfficialCivicAlertsSnapshot: providers.official }));
vi.mock("@/lib/integrations/nps", () => ({ getNpsAlerts: providers.nps }));
vi.mock("@/lib/events/notices", () => ({ activeEventNotices: () => [] }));

const RETURN_TO = "/today/tonight?intent=pizza&in=brunswick";
function situation(alerts: NwsAlert[] = []) {
  return {
    generatedAt: "2026-09-30T20:00:00.000Z",
    sources: {
      weather: { source: "nws", availability: "available", freshness: "fresh", data: alerts, asOf: "2026-09-30T20:00:00.000Z", capturedAt: "2026-09-30T20:00:00.000Z", staleAfterSeconds: 300 },
      traffic: { source: "mdot-chart", availability: "unavailable", freshness: "unknown", data: [] },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime("2026-09-30T20:00:00.000Z");
  Object.values(providers).forEach((provider) => provider.mockReset());
  providers.situation.mockResolvedValue(situation());
  providers.roads.mockResolvedValue({ attention: [] });
  providers.official.mockResolvedValue({ alerts: [] });
  providers.nps.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live provider read in offline test"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("compact civic alert affected areas", () => {
  it("expires a road source using the request clock rather than a cached situation assembly", async () => {
    vi.setSystemTime("2026-09-30T20:00:30.000Z");
    providers.roads.mockResolvedValue({
      generatedAt: "2026-09-30T20:00:00.000Z",
      sources: { workZones: { available: true, checkedAt: "2026-09-30T19:54:10.000Z", asOf: "2026-09-30T20:00:00.000Z", data: [] } },
      attention: [{ id: "cached-closure", kind: "work-zone-closure", severity: "warning", title: "US 15 work-zone closure", detail: "All lanes closed", scope: "US 15" }],
    });
    expect(renderToStaticMarkup(await CivicAlerts({ compact: true }))).not.toContain("US 15 work-zone closure");
  });
  it.each([
    ["2026-09-30T20:00:10.000Z", false],
    ["2026-09-30T20:00:30.000Z", false],
    [null, false], ["invalid", false],
    ["2026-09-30T20:00:40.000Z", true],
  ] as const)("checks cached civic expiry %s at request time (visible=%s)", async (expiresAt, visible) => {
    vi.setSystemTime("2026-09-30T20:00:30.000Z");
    providers.official.mockResolvedValue({ alerts: [{ kind: "city-emergency", state: "active", active: true, title: "Frederick emergency", summary: "Follow official instructions.", expiresAt, scope: "city", url: "https://www.cityoffrederickmd.gov/AlertCenter.aspx" }] });
    const html = renderToStaticMarkup(await CivicAlerts({ compact: true }));
    if (visible) expect(html).toContain("Frederick emergency");
    else expect(html).not.toContain("Frederick emergency");
  });
  it.each([false, true])("shows only a source-verified road interruption (verified=%s), independent of another failed feed", async (verified) => {
    const checkedAt = verified ? "2026-09-30T20:00:00.000Z" : "2026-09-30T19:30:00.000Z";
    providers.roads.mockResolvedValue({
      generatedAt: checkedAt,
      sources: { workZones: { available: true, data: [], checkedAt, asOf: checkedAt }, snowEmergency: { available: false, data: [] } },
      attention: [{ id: "work-zone-closure", kind: "work-zone-closure", severity: "warning", title: "US 15 work-zone closure", detail: "All lanes closed", scope: "US 15", sourceLabel: "Maryland WZDx", observedAt: checkedAt }],
    });
    const html = renderToStaticMarkup(await CivicAlerts({ compact: true }));
    if (verified) expect(html).toContain("US 15 work-zone closure");
    else expect(html).not.toContain("US 15 work-zone closure");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the NWS area beside its source and preserves the Tonight return", async () => {
    const alert: NwsAlert = {
      id: "offline-nws", event: "Heat Warning", headline: "Take precautions tonight.",
      description: "", severity: "Severe", urgency: "Expected", certainty: "Likely",
      starts_at: "2026-09-30T18:00:00.000Z", ends_at: "2026-10-01T02:00:00.000Z",
      area: "Frederick County; Carroll County", url: "https://api.weather.gov/alerts/offline-nws",
    };
    providers.situation.mockResolvedValue(situation([alert]));
    const html = renderToStaticMarkup(await CivicAlerts({ compact: true, returnTo: RETURN_TO }));

    expect(html).toContain("NWS · Frederick County + 1 area");
    expect(html).toContain("/pulse?open=alerts&amp;returnTo=%2Ftoday%2Ftonight%3Fintent%3Dpizza%26in%3Dbrunswick");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names the affected park and retains an external notice link", async () => {
    const alert: NpsAlert = {
      id: "offline-nps", parkCode: "cato", parkName: "Catoctin Mountain Park",
      title: "Visitor center closure", description: "The visitor center is closed tonight.",
      category: "Park Closure", url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
    };
    providers.nps.mockResolvedValue([alert]);
    const html = renderToStaticMarkup(await CivicAlerts({ compact: true, returnTo: RETURN_TO }));

    expect(html).toContain("NPS · Catoctin Mountain Park");
    expect(html).toContain('href="https://www.nps.gov/cato/planyourvisit/conditions.htm"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(fetch).not.toHaveBeenCalled();
  });
});
