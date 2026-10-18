import { createElement, Suspense, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TodayMasthead from "./TodayMasthead";
import TodayWeatherView, { WeatherPending } from "./TodayWeatherView";

vi.mock("@/components/nav/AppTransitionLink", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

describe("Today masthead composition", () => {
  it("keeps the full heading accessible while moving date and county into quiet context", () => {
    const html = renderToStaticMarkup(createElement(TodayMasthead, {
      title: "This afternoon in Frederick County", shortTitle: "This afternoon",
      dateline: "Friday, October 16", weather: createElement("p", null, "Weather reading"),
    }));
    expect(html).toMatch(/<h1[^>]*aria-label="This afternoon in Frederick County"[^>]*>This afternoon<\/h1>/);
    expect(html).toContain('<span class="sr-only">Frederick County · </span>Friday, October 16');
    expect(html.indexOf("data-today-dateline")).toBeLessThan(html.indexOf("data-today-weather"));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("renders the heading while its weather child is still waiting", () => {
    function WaitingWeather(): never { throw new Promise(() => {}); }
    const html = renderToStaticMarkup(createElement(TodayMasthead, {
      title: "This afternoon in Frederick County",
      weather: createElement(Suspense, { fallback: createElement(WeatherPending) }, createElement(WaitingWeather)),
    }));
    expect(html).toContain("<h1");
    expect(html).toContain("This afternoon in Frederick County");
    expect(html).toContain("Loading forecast");
    // The real pending owner preserves immediate access without a second route
    // or claiming a provider read before the bounded child resolves.
    expect(html.match(/href="\/pulse\?open=weather"/g)).toHaveLength(1);
    expect(html).not.toContain("briefly unavailable");
    expect(html).not.toContain("<img");
  });

  it("gives one forecast route the original dated read and unavailable-safety qualification", () => {
    const html = renderToStaticMarkup(createElement(TodayMasthead, {
      title: "Tonight in Frederick County",
      weather: createElement(TodayWeatherView, {
        density: "masthead", headline: "Mostly cloudy", condition: "Mostly cloudy",
        temperatureF: 70, highF: 75, sun: { label: "Sunset", time: "6:36 PM" },
        variant: null, forecastAvailable: true, issuedAt: "2026-10-12T14:53:00.000Z",
        safetyNote: "The air-quality reading is unavailable.", daylight: createElement("span", null, " · 4h 4m of daylight left"),
      }),
    }));
    for (const fact of ["70°", "Mostly cloudy", "NWS forecast · Frederick", "Oct 12, 2026, 10:53 AM EDT", "High 75°", "Sunset 6:36 PM", "4h 4m of daylight left", "The air-quality reading is unavailable."]) {
      expect(html).toContain(fact);
    }
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain("<details");
    expect(html.match(/<summary\b/g)).toHaveLength(1);
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Forecast details for Frederick.");
    expect(summary).toContain("70 degrees Fahrenheit forecast");
    expect(summary).toContain("Mostly cloudy");
    expect(summary).not.toMatch(/<(a|button|input|select|textarea|div)\b/);
    expect(html.indexOf('href="/pulse?open=weather"')).toBeGreaterThan(html.indexOf("</summary>"));
    expect(html).not.toContain("<details open");
    expect(html).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(html).not.toContain("Weather in Frederick");
  });
});

describe("Today compact weather disclosure", () => {
  const reading = {
    density: "masthead" as const, headline: "Mostly cloudy", condition: "Mostly cloudy",
    temperatureF: 70, highF: 75, sun: { label: "Sunset", time: "6:36 PM" },
    variant: null, forecastAvailable: true, issuedAt: "2026-10-12T14:53:00.000Z", safetyNote: null,
  };

  it("discloses routine evidence while keeping the forecast and feed uncertainty in the initial read", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, headline: "Flash Flood Warning is active.", safetyNote: "The air-quality reading is unavailable.",
    }));
    const evidenceStart = html.indexOf("<details");
    const evidenceEnd = html.indexOf("</details>");
    const details = html.slice(evidenceStart, evidenceEnd);
    expect(details).toContain('dateTime="2026-10-12T14:53:00.000Z"');
    expect(details).toContain("High 75°");
    const summaryEnd = html.indexOf("</summary>");
    expect(html.indexOf("70°")).toBeGreaterThan(evidenceStart);
    expect(html.indexOf("70°")).toBeLessThan(summaryEnd);
    expect(details.indexOf('href="/pulse?open=weather"')).toBeGreaterThan(details.indexOf("</summary>"));
    expect(html.indexOf("Flash Flood Warning is active.")).toBeLessThan(evidenceStart);
    expect(html.indexOf("The air-quality reading is unavailable.")).toBeGreaterThan(evidenceEnd);
    expect(details).not.toContain("Flash Flood Warning is active.");
    expect(details).not.toContain("The air-quality reading is unavailable.");
  });

  it("retains warning and unavailable forecast without a misleading detail control or invented values", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, forecastAvailable: false, headline: "Flash Flood Warning is active.", condition: "",
      temperatureF: null, highF: null, sun: null, issuedAt: null,
    }));
    expect(html).toContain("Flash Flood Warning is active.");
    expect(html).toContain("The NWS forecast is briefly unavailable.");
    expect(html).not.toContain("<details");
    expect(html.match(/href="\/pulse\?open=weather"/g)).toHaveLength(1);
    expect(html).not.toContain("70°");
    expect(html).not.toContain("High");
  });
});
