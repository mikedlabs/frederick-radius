import { createElement, type CSSProperties, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREDERICK_CENTER } from "@/lib/geo";
import type { NwsForecast } from "@/lib/integrations/nws";
import TonightWeather from "./TonightWeather";

const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/nws", () => ({ getNwsForecast: provider }));
vi.mock("next/link", () => ({
  default: ({ href, children, className, style }: {
    href: string; children: ReactNode; className?: string; style?: CSSProperties;
  }) => createElement("a", { href, className, style }, children),
}));

const RETURN_TO = "/today/tonight?intent=pizza&in=brunswick";
const STARTS_AT = "2026-09-30T22:00:00.000Z";
const forecast: NwsForecast = {
  asOf: "2026-09-30T20:00:00.000Z",
  hourly: [{
    startTime: STARTS_AT, endTime: "2026-09-30T23:00:00.000Z",
    temperature: 65, temperatureUnit: "F", shortForecast: "Partly cloudy",
    windSpeed: "5 mph", windDirection: "NW", icon: "",
  }],
  daily: [],
};

beforeEach(() => {
  provider.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live provider read in offline test"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Tonight forecast geography", () => {
  it("labels the Frederick reading even when returning to another town", async () => {
    provider.mockResolvedValue(forecast);
    const html = renderToStaticMarkup(await TonightWeather({ startsAt: STARTS_AT, returnTo: RETURN_TO }));

    expect(provider).toHaveBeenCalledWith(FREDERICK_CENTER);
    expect(html).toContain("65°F · Partly cloudy");
    expect(html).toContain("NWS forecast for Frederick");
    expect(html).toContain("returnTo=%2Ftoday%2Ftonight%3Fintent%3Dpizza%26in%3Dbrunswick");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call the forecast unavailable when tonight is beyond the hourly preview", async () => {
    provider.mockResolvedValue({
      ...forecast,
      asOf: "2026-09-30T09:00:00.000Z",
      hourly: [{ ...forecast.hourly[0],
        startTime: "2026-09-30T20:00:00.000Z",
        endTime: "2026-09-30T21:00:00.000Z",
        temperature: 81,
      }],
    });
    const html = renderToStaticMarkup(await TonightWeather({ startsAt: STARTS_AT, returnTo: RETURN_TO }));

    expect(html).toContain("Tonight is beyond the hourly preview.");
    expect(html).toContain("Check Frederick’s NWS forecast");
    expect(html).not.toContain("unavailable");
    expect(html).not.toContain("81°F");
    expect(html).toContain("returnTo=%2Ftoday%2Ftonight%3Fintent%3Dpizza%26in%3Dbrunswick");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not invent an hourly horizon when the provider has no dated hourly periods", async () => {
    for (const result of [{ ...forecast, hourly: [] }, { ...forecast, asOf: null }]) {
      provider.mockResolvedValue(result);
      const html = renderToStaticMarkup(await TonightWeather({ startsAt: STARTS_AT, returnTo: RETURN_TO }));
      expect(html).toContain("Frederick’s hourly forecast for tonight is unavailable.");
      expect(html).not.toContain("beyond the hourly preview");
      expect(html).not.toContain("65°F");
    }
  });

  it("keeps Frederick explicit when its forecast is unavailable", async () => {
    provider.mockResolvedValue(null);
    const html = renderToStaticMarkup(await TonightWeather({ startsAt: STARTS_AT, returnTo: RETURN_TO }));

    expect(html).toContain("Frederick’s hourly forecast for tonight is unavailable.");
    expect(html).toContain("Check Frederick’s NWS forecast");
    expect(html).toContain("/pulse?open=weather&amp;returnTo=");
    expect(fetch).not.toHaveBeenCalled();
  });
});
