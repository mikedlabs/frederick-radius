import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import {
  getPulsePointIncidentsResult,
  type PulsePointIncident,
  type PulsePointIncidentSeverity,
} from "@/lib/integrations/pulsepoint";
import { getAirQuality } from "@/lib/integrations/airnow";

vi.mock("@/lib/integrations/nws-alerts", () => ({ getNwsAlertsResult: vi.fn() }));
vi.mock("@/lib/integrations/fcps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/fcps")>();
  return { ...actual, getFcpsAlertsResult: vi.fn() };
});
vi.mock("@/lib/integrations/mdot-chart", () => ({ getChartIncidentsFrederickResult: vi.fn() }));
vi.mock("@/lib/integrations/firstenergy", () => ({ getFrederickOutagesResult: vi.fn() }));
vi.mock("@/lib/integrations/pulsepoint", () => ({
  getPulsePointIncidentsResult: vi.fn(),
  isPulsePointAlert: (incident: PulsePointIncident) => incident.severity === "severe",
}));
vi.mock("@/lib/integrations/airnow", () => ({
  getAirQuality: vi.fn(),
  isFreshAqiObservation: vi.fn(() => true),
  pickWorstAqi: vi.fn((observations: unknown[]) => observations[0] ?? null),
}));

import { GET } from "@/app/api/pulse/status/route";

const emptyOutages = { total_out: 0, total_served: 0, munis: [] };
const safetyIncident = (
  type: string,
  severity: PulsePointIncidentSeverity,
  id = type,
): PulsePointIncident => ({
  id,
  type,
  severity,
  address: "Frederick County",
  received_at: "2026-07-27T16:00:00.000Z",
});

describe("GET /api/pulse/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getNwsAlertsResult).mockResolvedValue({ alerts: [], available: true });
    vi.mocked(getFcpsAlertsResult).mockResolvedValue({ data: [], available: true });
    vi.mocked(getChartIncidentsFrederickResult).mockResolvedValue({ data: [], available: true });
    vi.mocked(getFrederickOutagesResult).mockResolvedValue({ data: emptyOutages, available: true });
    vi.mocked(getPulsePointIncidentsResult).mockResolvedValue({
      data: [],
      available: false,
      configured: false,
    });
    vi.mocked(getAirQuality).mockResolvedValue([{
      parameter: "PM2.5",
      aqi: 32,
      category: { id: 1, name: "Good", color: "#315A43" },
      reportingArea: "Frederick",
      dateObserved: "2026-07-27",
      hourObserved: 12,
    }]);
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

  it("does not keep an older closure active after a newer reopening", async () => {
    vi.mocked(getFcpsAlertsResult).mockResolvedValue({
      available: true,
      data: [
        {
          id: "closed",
          title: "Schools closed",
          description: "",
          status: "closed",
          published_at: "2026-07-27T12:00:00.000Z",
          url: "https://www.fcps.org/closed",
        },
        {
          id: "reopened",
          title: "Schools reopening",
          description: "",
          status: "open",
          published_at: "2026-07-27T15:00:00.000Z",
          url: "https://www.fcps.org/reopened",
        },
      ],
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
    });
  });

  it("keeps routine PulsePoint calls out of the global alert count", async () => {
    vi.mocked(getPulsePointIncidentsResult).mockResolvedValue({
      available: true,
      configured: true,
      data: [
        safetyIncident("Public Assist", "routine", "assist"),
        safetyIncident("Lockout", "routine", "lockout"),
        safetyIncident("Fire Alarm", "routine", "alarm"),
      ],
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
    });
  });

  it("reserves the red global alert for severe PulsePoint incidents", async () => {
    vi.mocked(getPulsePointIncidentsResult).mockResolvedValue({
      available: true,
      configured: true,
      data: [
        safetyIncident("Traffic Collision", "notable", "collision"),
        safetyIncident("Public Assist", "routine", "assist"),
        safetyIncident("Structure Fire", "severe", "fire"),
      ],
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: true,
      count: 1,
      tone: "alert",
      ok: true,
    });
  });

  it("does not promote a notable PulsePoint incident to an urgent alert", async () => {
    vi.mocked(getPulsePointIncidentsResult).mockResolvedValue({
      available: true,
      configured: true,
      data: [safetyIncident("Wires Down", "notable")],
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      active: false,
      count: 0,
      tone: "quiet",
      ok: true,
    });
  });
});
