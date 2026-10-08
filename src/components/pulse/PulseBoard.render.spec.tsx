// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PulseBoard, { type PulseHero, type PulseStatusMapData, type PulseTile } from "./PulseBoard";

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
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("All quiet");
    expect(container.querySelector("[data-pulse-briefing] time")?.getAttribute("datetime")).toBeTruthy();
    const reading = container.querySelector('[data-pulse-key="weather"]');
    expect(reading?.getAttribute("aria-label")).toContain("72 degrees");
    expect(reading?.textContent).toContain("Source · NWS · weather.gov");
    expect(reading?.getAttribute("aria-haspopup")).toBe("dialog");
  });
  it("keeps an unavailable source out of current readings, behind the existing named disclosure", () => {
    const container = render({ allClear: false, degraded: true }, [{ ...weather, active: true, degraded: true, feature: undefined, availability: "unavailable", countLabel: "Weather feed unavailable" }]);
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Partial data");
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
  it("prints the county status word and color the header dot shows", () => {
    const traffic: PulseTile = { ...weather, key: "traffic", label: "Traffic", kind: "status", feature: undefined, reading: false, attention: true, active: true, countLabel: "Crash on US 15 North" };
    const container = render({ allClear: false, tone: "danger", leadKey: "traffic", line: "US 15 North has a reported crash.", status: { word: "Advisory", tone: "caution", count: 1 } }, [traffic, weather]);
    const briefing = container.querySelector("[data-pulse-briefing]");
    expect(briefing?.textContent).toContain("Advisory");
    expect(briefing?.textContent).not.toContain("Urgent");
    expect(briefing?.innerHTML).toContain("var(--app-warning)");
  });
  it("puts the source and its time on the line under the lead sentence", () => {
    const traffic: PulseTile = { ...weather, key: "traffic", label: "Traffic", kind: "status", feature: undefined, reading: false, attention: true, active: true, countLabel: "1 closure" };
    const container = render({ allClear: false, tone: "warning", leadKey: "traffic", line: "Advisory: MD 75 work-zone closure.", leadMeta: "Maryland WZDx · Observed 3h ago", sub: "All lanes closed.", status: { word: "Advisory", tone: "caution", count: 1 } }, [traffic, weather]);
    const briefing = container.querySelector("[data-pulse-briefing]")!;
    const h1 = briefing.querySelector("h1")!;
    expect(h1.textContent).toBe("Advisory: MD 75 work-zone closure.");
    expect(h1.nextElementSibling?.textContent).toBe("Maryland WZDx · Observed 3h ago");
    expect(h1.nextElementSibling?.nextElementSibling?.textContent).toBe("All lanes closed.");
  });
  it("prints the NWS chance of rain on the weather reading when the forecast has one", () => {
    const container = render({}, [{ ...weather, feature: { temp: 70, condition: "Clear", hl: "H 76° · L 55°", rain: "Up to 40% chance of rain in the next 12 hours" } }]);
    const reading = container.querySelector('[data-pulse-key="weather"]');
    expect(reading?.textContent).toContain("Up to 40% chance of rain in the next 12 hours");
    expect(reading?.getAttribute("aria-label")).toContain("Up to 40% chance of rain");
  });
  it("puts current conditions above the live transit board", () => {
    const train: PulseTile = { ...weather, key: "train", label: "MARC trains", kind: "status", feature: undefined, reading: false, active: true, countLabel: "6:28 PM" };
    const container = render({ allClear: false }, [train, weather]);
    const readings = container.querySelector("#pulse-readings-heading");
    const live = container.querySelector("#pulse-live-board-heading");
    expect(readings && live).toBeTruthy();
    expect(readings!.compareDocumentPosition(live!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("maps located items under the card, numbers their rows and lists the rest as countywide", () => {
    const traffic: PulseTile = { ...weather, key: "traffic", label: "Traffic", kind: "status", feature: undefined, reading: false, attention: true, active: true, countLabel: "1 closure" };
    const alerts: PulseTile = { ...traffic, key: "alerts", label: "Official alerts", countLabel: "Heat Advisory" };
    const statusMap: PulseStatusMapData = {
      outline: "M100 100 900 100 900 900Z",
      word: "Advisory",
      roadFeedsComplete: true,
      items: [
        { id: "nws:1", title: "Heat Advisory", severity: "advisory", tileKey: "alerts", meta: "National Weather Service · Issued 2h ago" },
        { id: "mdot-road:wz", title: "MD 75 work-zone closure", severity: "advisory", tileKey: "traffic", meta: "Maryland WZDx · Observed 3h ago", point: { x: 600, y: 520 } },
      ],
    };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(PulseBoard, {
      hero: { allClear: false, line: "Advisory: Heat Advisory.", sub: "Heat index values up to 105.", renderedAt: Date.now(), status: { word: "Advisory", tone: "caution", count: 2 } },
      chips: [{ tone: "warning", key: "traffic", label: "MD 75 work-zone closure" }],
      tiles: [alerts, traffic, weather],
      statusMap,
    }));
    const section = container.querySelector("[data-pulse-status-map]")!;
    expect(section).not.toBeNull();
    // Directly under the card, on Cream, before the rest of the board.
    expect(container.querySelector("[data-pulse-briefing]")?.nextElementSibling).toBe(section);
    expect(section.querySelector('[data-overview-aspect="wide"]')).not.toBeNull();
    expect(section.querySelector('[data-overview-point="mdot-road:wz"] [data-overview-tone="caution"]')?.textContent).toBe("1");
    const mapped = section.querySelector('ol[aria-label="Mapped reports"]')!;
    expect(mapped.querySelectorAll("li")).toHaveLength(1);
    expect(mapped.textContent).toContain("MD 75 work-zone closure");
    expect(mapped.textContent).toContain("Advisory · Maryland WZDx · Observed 3h ago");
    expect(section.querySelector("h3")?.textContent).toBe("Countywide");
    expect(section.querySelector('ul[aria-labelledby="pulse-status-countywide"]')?.textContent).toContain("Heat Advisory");
    expect(section.textContent).toContain("Tap the point to find its report.");
    // A report the rows already list is not repeated under Needs attention.
    expect(container.querySelector("#pulse-attention-heading")).toBeNull();
  });
  it("shows the empty map and says why when nothing is mapped", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(PulseBoard, {
      hero: { allClear: false, degraded: true, line: "The available feeds show no major disruptions.", sub: "Some live checks are unavailable.", renderedAt: Date.now(), status: { word: "Unknown", tone: "quiet", count: 0 } },
      chips: [],
      tiles: [weather],
      statusMap: { outline: "M100 100 900 100 900 900Z", word: "Unknown", roadFeedsComplete: false, items: [] },
    }));
    const section = container.querySelector("[data-pulse-status-map]")!;
    expect(section.querySelectorAll("[data-overview-point]")).toHaveLength(0);
    expect(section.textContent).toContain("Radius could not reach the road feeds, so nothing is mapped.");
    expect(section.querySelector("ol, ul")).toBeNull();
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
