import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NpsAlert } from "@/lib/integrations/nps";
import CivicAlerts, { CIVIC_ALERTS_SNAPSHOT_DEADLINE_MS } from "./CivicAlerts";

const sources = vi.hoisted(() => ({
  situation: vi.fn(), roads: vi.fn(), official: vi.fn(), nps: vi.fn(), notices: vi.fn(),
}));
// These are the original outer cache promises, not the provider work inside
// them. A stalled cache must not bypass the server component's deadline.
vi.mock("@/lib/live/currentSituation", () => ({ getCurrentSituationSnapshot: sources.situation }));
vi.mock("@/lib/live/roadIntelligence", () => ({ getRoadIntelligenceSnapshot: sources.roads }));
vi.mock("@/lib/live/officialSignals", () => ({ getOfficialCivicAlertsSnapshot: sources.official }));
vi.mock("@/lib/integrations/nps", () => ({ getNpsAlerts: sources.nps }));
vi.mock("@/lib/events/notices", () => ({ activeEventNotices: sources.notices }));

const NOW = "2026-09-30T20:00:00.000Z";
const parkAlert: NpsAlert = {
  id: "park-closure", parkCode: "cato", parkName: "Catoctin Mountain Park",
  title: "Visitor center closure", description: "The visitor center is closed tonight.",
  category: "Park Closure", url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
};
const cityAlert = {
  kind: "city-emergency", state: "active", active: true, title: "Emergency water notice",
  summary: "Follow official water instructions.", expiresAt: "2026-10-01T02:00:00.000Z",
  scope: "city", url: "https://www.cityoffrederickmd.gov/AlertCenter.aspx",
};
function quietSituation() {
  return { sources: {
    weather: { availability: "unavailable", freshness: "unknown", data: [] },
    traffic: { availability: "unavailable", freshness: "unknown", data: [] },
  } };
}
const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  Object.values(sources).forEach((source) => source.mockReset());
  sources.situation.mockResolvedValue(quietSituation());
  sources.roads.mockResolvedValue({ attention: [] });
  sources.official.mockResolvedValue({ alerts: [] });
  sources.nps.mockResolvedValue([]);
  sources.notices.mockReturnValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected provider request in offline deadline test"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function finishAtDeadline(pending: ReturnType<typeof CivicAlerts>) {
  let settled = false;
  void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(CIVIC_ALERTS_SNAPSHOT_DEADLINE_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(settled).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  return result;
}

describe("Today civic alert outer-cache deadlines", () => {
  it.each(["situation", "roads", "official", "nps"] as const)(
    "finishes when the original %s promise never settles and retains another verified source",
    async (stalled) => {
      sources[stalled].mockImplementation(never);
      if (stalled === "nps") sources.official.mockResolvedValue({ alerts: [cityAlert] });
      else sources.nps.mockResolvedValue([parkAlert]);
      const result = await finishAtDeadline(CivicAlerts({ compact: true }));
      const html = renderToStaticMarkup(result);
      expect(html).toContain(stalled === "nps" ? cityAlert.title : parkAlert.title);
      expect(html).toContain(stalled === "nps" ? "CITY · City of Frederick" : "NPS · Catoctin Mountain Park");
      expect(html).toContain(stalled === "nps" ? cityAlert.url : parkAlert.url);
      expect(html).not.toMatch(/all clear|everything is clear|no active alerts|roads are clear/i);
      expect(sources[stalled]).toHaveBeenCalledOnce();
    },
  );

  it("retains fresh weather when the independent official cache stalls", async () => {
    sources.official.mockImplementation(never);
    sources.situation.mockResolvedValue({ sources: {
      ...quietSituation().sources,
      weather: { source: "nws", availability: "available", freshness: "fresh", asOf: NOW,
        capturedAt: NOW, staleAfterSeconds: 300, data: [{
          id: "heat-warning", event: "Heat Warning", headline: "Take precautions tonight.",
          description: "", severity: "Severe", starts_at: "2026-09-30T18:00:00.000Z",
          ends_at: "2026-10-01T02:00:00.000Z", area: "Frederick County",
        }] },
    } });
    const html = renderToStaticMarkup(await finishAtDeadline(CivicAlerts({ compact: true })));
    expect(html).toContain("Heat Warning");
    expect(html).toContain("NWS · Frederick County");
    expect(html).toContain('href="/pulse?open=alerts"');
  });

  it("does not manufacture a quiet result or timestamp when every live source stalls", async () => {
    for (const source of [sources.situation, sources.roads, sources.official, sources.nps]) {
      source.mockImplementation(never);
    }
    const result = await finishAtDeadline(CivicAlerts({ compact: true }));
    expect(result).toBeNull();
    expect(renderToStaticMarkup(result)).toBe("");
  });

  it("preserves a real owner notice when every live source is unavailable", async () => {
    for (const source of [sources.situation, sources.roads, sources.official, sources.nps]) {
      source.mockImplementation(never);
    }
    sources.notices.mockReturnValue([{
      slug: "verified-show-notice", headline: "Tonight's show is postponed", status: "postponed",
    }]);
    const html = renderToStaticMarkup(await finishAtDeadline(CivicAlerts({ compact: true })));
    expect(html).toContain("Tonight&#x27;s show is postponed");
    expect(html).toContain('href="/events/verified-show-notice"');
    expect(html).not.toContain("more active alerts");
  });

  it("consumes immediate and late cache failures without discarding available alerts", async () => {
    let rejectLater!: (error: Error) => void;
    sources.situation.mockImplementation(() => new Promise((_, reject) => { rejectLater = reject; }));
    sources.official.mockRejectedValue(new Error("cache unavailable"));
    sources.nps.mockResolvedValue([parkAlert]);
    const html = renderToStaticMarkup(await finishAtDeadline(CivicAlerts({ compact: true })));
    expect(html).toContain(parkAlert.title);
    rejectLater(new Error("late cache failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(html).not.toContain("cache failure");
    expect(vi.getTimerCount()).toBe(0);
  });
});
