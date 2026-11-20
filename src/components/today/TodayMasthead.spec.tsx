// @vitest-environment jsdom
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
        temperatureF: 70, highF: 75, lowF: 47, sunriseTime: "7:17 AM", sunsetTime: "6:36 PM", sun: { label: "Sunset", time: "6:36 PM" },
        variant: null, forecastAvailable: true, issuedAt: "2026-10-12T14:53:00.000Z",
        safetyNote: "The air-quality reading is unavailable.", daylight: createElement("span", null, " · 4h 4m of daylight left"),
      }),
    }));
    for (const fact of ["70°", "Mostly cloudy", "NWS forecast · Frederick", "Oct 12, 2026, 10:53 AM EDT", "4h 4m of daylight left", "The air-quality reading is unavailable."]) {
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
    temperatureF: 70, highF: 75, lowF: 47, sunriseTime: "7:17 AM", sunsetTime: "6:36 PM", sun: { label: "Sunset", time: "6:36 PM" },
    variant: null, forecastAvailable: true, issuedAt: "2026-10-12T14:53:00.000Z", safetyNote: null,
  };

  it("shows the day’s high, low, sunrise and sunset first and keeps a missing air-quality reading in the details", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, actionableHeadline: true, headline: "Flash Flood Warning is active.",
      safetyNote: "The air-quality reading is unavailable.", safetyNoteRoutine: true,
    }));
    const evidenceStart = html.indexOf("<details");
    const evidenceEnd = html.indexOf("</details>");
    const details = html.slice(evidenceStart, evidenceEnd);
    expect(details).toContain('dateTime="2026-10-12T14:53:00.000Z"');
    const doc = new DOMParser().parseFromString(html, "text/html");
    const stats = doc.querySelector("[data-weather-stats]");
    expect(stats).not.toBeNull();
    expect(stats!.closest("details")).toBeNull();
    for (const fact of [/High\s*75°/i, /Low\s*47°/i, /Sunrise\s*7:17\s*AM/i, /Sunset\s*6:36\s*PM/i]) {
      expect(stats!.textContent).toMatch(fact);
    }
    const summaryEnd = html.indexOf("</summary>");
    expect(html.indexOf("70°")).toBeGreaterThan(evidenceStart);
    expect(html.indexOf("70°")).toBeLessThan(summaryEnd);
    expect(details.indexOf('href="/pulse?open=weather"')).toBeGreaterThan(details.indexOf("</summary>"));
    expect(html.indexOf("Flash Flood Warning is active.")).toBeGreaterThan(evidenceEnd);
    // A missing air-quality reading is routine evidence behind the forecast details.
    expect(details.indexOf("The air-quality reading is unavailable.")).toBeGreaterThan(details.indexOf("</summary>"));
    expect(details).toContain("data-weather-routine-note");
    expect(html).not.toContain("data-weather-safety-note");
    expect(html.slice(evidenceEnd)).not.toContain("The air-quality reading is unavailable.");
    expect(details).not.toContain("Flash Flood Warning is active.");
  });

  it.each(["The weather-alert feed is unavailable.", "Weather-alert and air-quality checks are unavailable."])(
    "keeps a safety-relevant feed miss in the initial read: %s", (note) => {
      const html = renderToStaticMarkup(createElement(TodayWeatherView, { ...reading, safetyNote: note, safetyNoteRoutine: false }));
      const evidenceEnd = html.indexOf("</details>");
      expect(html.indexOf(note)).toBeGreaterThan(evidenceEnd);
      expect(html.slice(html.indexOf("<details"), evidenceEnd)).not.toContain(note);
    },
  );

  it("keeps a routine note visible when there is no forecast to disclose", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, forecastAvailable: false, headline: "Flash Flood Warning is active.", condition: "", temperatureF: null,
      highF: null, lowF: null, sun: null, issuedAt: null, safetyNote: "The air-quality reading is unavailable.", safetyNoteRoutine: true,
    }));
    expect(html).not.toContain("<details");
    expect(html).toContain("The air-quality reading is unavailable.");
  });

  it("labels an earlier daytime high with its own issuance in the forecast details", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, retainedHighIssuedAt: "2026-10-12T12:30:00Z",
    }));
    const fragment = new DOMParser().parseFromString(html, "text/html");
    expect(fragment.querySelector("[data-weather-stats]")?.textContent).toContain("Earlier high 75°");
    expect(fragment.querySelector('details time[datetime="2026-10-12T12:30:00.000Z"]')?.textContent).toMatch(/8:30 AM/);
  });

  it("retains warning and unavailable forecast without a misleading detail control or invented values", () => {
    const html = renderToStaticMarkup(createElement(TodayWeatherView, {
      ...reading, forecastAvailable: false, actionableHeadline: true, headline: "Flash Flood Warning is active.", condition: "",
      temperatureF: null, highF: null, lowF: null, sun: null, issuedAt: null,
    }));
    expect(html).toContain("Flash Flood Warning is active.");
    expect(html).toContain("The NWS forecast is briefly unavailable.");
    expect(html).not.toContain("<details");
    expect(html.match(/href="\/pulse\?open=weather"/g)).toHaveLength(1);
    expect(html).not.toContain("70°");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const stats = doc.querySelector("[data-weather-stats]");
    expect(stats?.textContent).toMatch(/Sunrise\s*7:17\s*AM/i);
    expect(stats?.textContent).toMatch(/Sunset\s*6:36\s*PM/i);
    expect(stats?.textContent).toMatch(/High\s*–unavailable/i);
    expect(stats?.textContent).toMatch(/Low\s*–unavailable/i);
    expect(stats?.textContent).toMatch(/unavailable/i);
  });
});
