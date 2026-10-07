import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { NpsAlert } from "@/lib/integrations/nps";
import CivicAlerts, { compactAlertSourceLine } from "./CivicAlerts";

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
      weather: { availability: "available", freshness: "fresh", data: alerts },
      traffic: { availability: "unavailable", freshness: "unknown", data: [] },
    },
  };
}

beforeEach(() => {
  Object.values(providers).forEach((provider) => provider.mockReset());
  providers.situation.mockResolvedValue(situation());
  providers.roads.mockResolvedValue({ attention: [] });
  providers.official.mockResolvedValue({ alerts: [] });
  providers.nps.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live provider read in offline test"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("compact civic alert affected areas", () => {
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

  it("clamps the row to the title plus its source on two lines", async () => {
    const alert: NpsAlert = {
      id: "offline-nps-long", parkCode: "cato", parkName: "Catoctin Mountain Park",
      title: "Visitor center and Owens Creek picnic area closed for storm repairs",
      description: "The visitor center and the Owens Creek picnic area are closed while crews repair storm damage to the access road and the lower parking lot, and visitors should expect detours along Park Central Road through the weekend.",
      category: "Park Closure",
      url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
    };
    providers.nps.mockResolvedValue([alert]);
    const html = renderToStaticMarkup(await CivicAlerts({ compact: true }));

    // The excerpt stays on the notice's own page; the row keeps one title
    // line and one source line, each truncated rather than wrapped.
    expect(html).not.toContain("storm damage to the access road");
    expect(html).toMatch(/data-alert-title="true" class="[^"]*\btruncate\b/);
    expect(html).toMatch(/data-alert-source="true" class="[^"]*\btruncate\b/);
    expect(html).toContain("NPS · Catoctin Mountain Park</span>");
  });
});

describe("compactAlertSourceLine", () => {
  it("leads with the source, then the area, then a short time tail", () => {
    expect(compactAlertSourceLine({ source: "NWS", scope: "Frederick County + 1 area", tail: "Until 10:00 PM" }))
      .toBe("NWS · Frederick County + 1 area · Until 10:00 PM");
    expect(compactAlertSourceLine({ source: "MDOT", scope: "", tail: "Started 9:10 PM" }))
      .toBe("MDOT · Started 9:10 PM");
  });

  it("leaves a prose excerpt out of the compact row", () => {
    expect(compactAlertSourceLine({
      source: "HEALTH",
      scope: "Frederick County",
      tail: "Residents in the affected area should boil water before drinking.",
    })).toBe("HEALTH · Frederick County");
  });
});
