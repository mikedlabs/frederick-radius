import { createElement, Suspense, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TodayMasthead from "./TodayMasthead";
import TodayWeatherView from "./TodayWeatherView";

vi.mock("@/components/nav/AppTransitionLink", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

describe("Today masthead composition", () => {
  it("renders the heading while its weather child is still waiting", () => {
    function WaitingWeather(): never { throw new Promise(() => {}); }
    const html = renderToStaticMarkup(createElement(TodayMasthead, {
      title: "This afternoon in Frederick County",
      weather: createElement(Suspense, { fallback: createElement("p", null, "Loading forecast") }, createElement(WaitingWeather)),
    }));
    expect(html).toContain("<h1");
    expect(html).toContain("This afternoon in Frederick County");
    expect(html).toContain("Loading forecast");
    expect(html.match(/href="\/pulse\?open=weather"/g)).toHaveLength(1);
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
    expect(html).not.toMatch(/<(button|input|select|textarea)\b/);
    expect(html).not.toContain("Weather in Frederick");
  });
});
