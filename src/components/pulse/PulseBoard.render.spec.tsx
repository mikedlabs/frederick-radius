// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PulseBoard, { type PulseHero, type PulseTile } from "./PulseBoard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
// The real Sheet has its own browser acceptance; these assertions cover the
// board's semantic hierarchy and honest visibility before opening that sheet.
vi.mock("@/components/ui/Sheet", () => ({ default: () => null }));
const weather: PulseTile = { key: "weather", label: "Weather", iconName: "CloudSun", sourceLabel: "NWS · weather.gov", countLabel: "Partly cloudy", accent: "var(--app-cool)", active: false, attention: false, reading: true, kind: "feature", feature: { temp: 72, condition: "Partly cloudy" }, body: null };
function render(hero: Partial<PulseHero>, tiles = [weather]) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(PulseBoard, { hero: { allClear: true, line: "No major disruption is reported.", sub: "Open a condition for its source and details.", renderedAt: Date.now(), ...hero }, chips: [], tiles }));
  return container;
}
describe("Pulse briefing presentation", () => {
  it("keeps one lead heading, page freshness and visible source alongside current readings", () => {
    const container = render({});
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Clear");
    expect(container.querySelector("[data-pulse-briefing] time")?.getAttribute("datetime")).toBeTruthy();
    const reading = container.querySelector('[data-pulse-key="weather"]');
    expect(reading?.getAttribute("aria-label")).toContain("72 degrees");
    expect(reading?.textContent).toContain("Source · NWS · weather.gov");
    expect(reading?.getAttribute("aria-haspopup")).toBe("dialog");
  });
  it("keeps an unavailable source out of current readings, behind the existing named disclosure", () => {
    const container = render({ allClear: false, degraded: true }, [{ ...weather, active: true, degraded: true, feature: undefined, availability: "unavailable", countLabel: "Weather feed unavailable" }]);
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Unknown");
    expect(container.querySelector('[data-pulse-bank="readings"]')).toBeNull();
    const disclosure = container.querySelector('section[aria-labelledby="pulse-secondary-heading"] details');
    expect(disclosure?.hasAttribute("open")).toBe(false);
    expect(disclosure?.querySelector('[data-pulse-key="weather"]')?.textContent).toContain("Feed unavailable");
    expect(disclosure?.textContent).toContain("NWS · weather.gov");
  });
  it("keeps urgent official guidance above the measurements and offers its one primary detail action", () => {
    const alert: PulseTile = { ...weather, key: "alerts", label: "Official alerts", kind: "status", feature: undefined, reading: false, attention: true, active: true, countLabel: "Flood warning" };
    const container = render({ allClear: false, degraded: true, tone: "danger", leadKey: "alerts", actionLabel: "Read the warning", line: "A flood warning affects the river.", leadMeta: "Through 8pm" }, [alert, weather]);
    const briefing = container.querySelector("[data-pulse-briefing]");
    expect(briefing?.textContent).toContain("Urgent");
    expect(briefing?.textContent).toContain("Through 8pm");
    expect(briefing?.querySelectorAll("button")).toHaveLength(1);
    expect(briefing?.querySelector("button")?.textContent).toContain("Read the warning");
    expect(container.querySelectorAll('[data-pulse-bank-item="readings"]')).toHaveLength(1);
  });
  it("keeps a raw measurement as a value and unit without inventing a progress gauge", () => {
    const container = render({}, [{ ...weather, key: "rivers", label: "Monocacy River", kind: "gauge", feature: undefined, gauge: { value: 2.4, unit: "ft", decimals: 1 }, countLabel: "At Jug Bridge", sourceLabel: "USGS Water Services" }]);
    const reading = container.querySelector('[data-pulse-key="rivers"]');
    expect(reading?.textContent).toContain("2.4ft");
    expect(reading?.textContent).toContain("At Jug Bridge");
    expect(reading?.textContent).toContain("USGS Water Services");
    expect(container.querySelector('progress, meter, [role="progressbar"]')).toBeNull();
  });
});
