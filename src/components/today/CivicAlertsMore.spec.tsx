// @vitest-environment jsdom
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
      weather: { availability: "available", freshness: "fresh", data: alerts },
      traffic: { availability: "unavailable", freshness: "unknown", data: [] },
    },
  };
}

const heat: NwsAlert = {
  id: "offline-nws", event: "Heat Warning", headline: "Take precautions tonight.",
  description: "", severity: "Severe", urgency: "Expected", certainty: "Likely",
  starts_at: "2026-09-30T18:00:00.000Z", ends_at: "2026-10-01T02:00:00.000Z",
  area: "Frederick County", url: "https://api.weather.gov/alerts/offline-nws",
};
const park: NpsAlert = {
  id: "offline-nps", parkCode: "cato", parkName: "Catoctin Mountain Park",
  title: "Park Central Road closed", description: "Park Central Road is closed for repairs.",
  category: "Park Closure", url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
};

beforeEach(() => {
  Object.values(providers).forEach((provider) => provider.mockReset());
  providers.situation.mockResolvedValue(situation());
  providers.roads.mockResolvedValue({ attention: [] });
  providers.official.mockResolvedValue({ alerts: [] });
  providers.nps.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live provider read in offline test"); }));
});
afterEach(() => vi.unstubAllGlobals());

async function renderAlerts() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(await CivicAlerts({ compact: true, returnTo: RETURN_TO }));
  return container;
}

describe("compact civic alert count line", () => {
  it("lists the extra alerts from the same array instead of an alerts sheet that lacks them", async () => {
    // Oct 6: "1 more active alert" opened /pulse?open=alerts, which holds only
    // NWS and City or County notices, so a park closure behind the count read
    // "no current notice was found".
    providers.situation.mockResolvedValue(situation([heat]));
    providers.nps.mockResolvedValue([park]);
    const container = await renderAlerts();

    const more = container.querySelector("details[data-alert-more]");
    expect(more?.querySelector("summary")?.textContent).toContain("1 more active alert");
    const rows = [...(more?.querySelectorAll("li a") ?? [])];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Park Central Road closed");
    expect(rows[0]?.textContent).toContain("NPS · Catoctin Mountain Park");
    expect(rows[0]?.getAttribute("href")).toBe(park.url);
    expect(rows[0]?.getAttribute("target")).toBe("_blank");
    // The only /pulse alerts link left is the top NWS row's own detail.
    expect(container.querySelectorAll('a[href^="/pulse?open=alerts"]')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the Tonight return on an in-app row inside the list", async () => {
    providers.nps.mockResolvedValue([park]);
    providers.situation.mockResolvedValue(
      situation([{ ...heat, severity: "Moderate", event: "Heat Advisory" }]),
    );
    const container = await renderAlerts();

    // The park closure outranks the advisory, so the weather row moves into
    // the list and keeps its return to Tonight.
    const row = container.querySelector("details[data-alert-more] li a");
    expect(row?.getAttribute("href")).toBe(
      "/pulse?open=alerts&returnTo=%2Ftoday%2Ftonight%3Fintent%3Dpizza%26in%3Dbrunswick",
    );
    expect(row?.hasAttribute("target")).toBe(false);
  });

  it("shows no count line for a single alert", async () => {
    providers.nps.mockResolvedValue([park]);
    const container = await renderAlerts();
    expect(container.querySelector("details[data-alert-more]")).toBeNull();
  });
});
