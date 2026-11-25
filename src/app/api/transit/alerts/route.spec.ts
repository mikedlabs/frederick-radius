import { expect, it, vi } from "vitest";
import { COUNTY_TRANSIT_BULLETIN_URL } from "@/lib/transit-service-calendar";
import { getTransitServiceAlertsResult } from "@/lib/integrations/transitRealtime";
import { GET } from "./route";

vi.mock("@/lib/integrations/transitRealtime", () => ({ getTransitServiceAlertsResult: vi.fn() }));

it.each([true, false])("keeps the county bulletin with no live alerts when feed availability is %s", async (available) => {
  const status = available ? "ok" : "unavailable";
  vi.mocked(getTransitServiceAlertsResult).mockResolvedValue({
    status, available, data: [], receivedAt: Date.parse("2026-11-27T12:00:00-05:00"),
  });
  const response = await (await GET()).json();
  expect(response).toMatchObject({
    status, available, alerts: [], countyBulletinSource: COUNTY_TRANSIT_BULLETIN_URL,
    countyBulletin: [expect.stringContaining("cancelled all service"), expect.stringContaining("7:15 a.m.")],
  });
});

it("omits the dated notice when the November bulletin ends", async () => {
  vi.mocked(getTransitServiceAlertsResult).mockResolvedValue({
    status: "ok", available: true, data: [], receivedAt: Date.parse("2026-11-29T00:00:00-05:00"),
  });
  expect(await (await GET()).json()).toMatchObject({ countyBulletin: [], countyBulletinSource: null });
});
