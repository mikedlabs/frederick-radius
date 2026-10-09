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
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Unable to verify");
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
  it("separates source check, publication and observation times from earlier road updates", () => {
    const container = render({
      allClear: false,
      countyStatus: {
        active: false, count: 0, tone: "quiet", ok: false, level: "Unknown",
        lastUpdated: new Date().toISOString(),
        checks: [
          { source: "Maryland road feeds", state: "stale", asOf: "2026-10-08T13:00:00.000Z", asOfBasis: "retrieval" },
          { source: "NWS alerts", state: "current", asOf: "2026-10-09T11:30:00.000Z", asOfBasis: "provider" },
          { source: "AirNow", state: "current", asOf: "2026-10-09T12:00:00.000Z", asOfBasis: "observation" },
          { source: "School notices", state: "unavailable", asOf: null, asOfBasis: null },
        ],
        roadCheck: { verified: false, currentCount: 0, checkedAt: null, earlierCount: 2, unverifiedSources: ["MDOT CHART"] },
      },
    });
    const checks = container.querySelector("[data-pulse-source-checks]");
    expect(checks?.querySelector("summary")?.textContent).toBe("Source checks");
    expect(checks?.hasAttribute("open")).toBe(false);
    expect(checks?.textContent).toContain("Last source check Oct 8, 2026, 9:00 AM EDT");
    expect(checks?.textContent).toContain("Verified for this snapshot");
    expect(checks?.textContent).toContain("Published Oct 9, 2026, 7:30 AM EDT");
    expect(checks?.textContent).toContain("Observed Oct 9, 2026, 8:00 AM EDT");
    expect(checks?.textContent).toContain("Source time unavailable");
    expect(Array.from(checks?.querySelectorAll("time") ?? [], (time) => time.getAttribute("datetime"))).toEqual([
      "2026-10-08T13:00:00.000Z", "2026-10-09T11:30:00.000Z", "2026-10-09T12:00:00.000Z",
    ]);
    const briefing = container.querySelector("[data-pulse-briefing]");
    expect(briefing?.textContent).toContain("Earlier road checks listed 2 updates. Current road conditions are unverified.");
    expect(briefing?.textContent).not.toContain("2 active");
  });
  it("qualifies a retained traffic lead as an earlier MDOT report", () => {
    const container = render({
      allClear: false, leadKey: "traffic", leadIsEarlier: true, line: "Snow emergency plan is active",
      sub: "Read the official restrictions before driving.",
      countyStatus: { active: false, count: 0, tone: "quiet", ok: false, level: "Unknown", lastUpdated: new Date().toISOString(),
        roadCheck: { verified: false, currentCount: 0, checkedAt: null, earlierCount: 1, unverifiedSources: ["MDOT snow emergency"] },
      },
    });
    expect(container.querySelector("h1")?.textContent).toBe("Earlier MDOT report: Snow emergency plan is active");
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Current road conditions are unverified. Earlier report guidance: Read the official restrictions before driving.");
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Unable to verify");
  });
  it("retains a verified current road lead when a different road feed is unavailable", () => {
    const container = render({
      allClear: false, leadKey: "traffic", leadIsEarlier: false,
      line: "MDOT reports a closure on a county route.",
      sub: "Read the official route guidance before leaving.",
      countyStatus: { active: true, count: 1, tone: "caution", ok: false, level: "Advisory", lastUpdated: new Date().toISOString(),
        roadCheck: { verified: false, currentCount: 1, checkedAt: null, earlierCount: 1, unverifiedSources: ["MDOT snow emergency"] },
      },
    });
    expect(container.querySelector("h1")?.textContent).toBe("MDOT reports a closure on a county route.");
    expect(container.querySelector("[data-pulse-status-level]")?.textContent).toBe("Advisory");
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).not.toContain("Earlier MDOT report:");
    expect(container.querySelector("[data-pulse-briefing]")?.textContent).toContain("Earlier road checks listed 1 update.");
  });
  it("does not present an invalid source timestamp as a check date", () => {
    const container = render({ countyStatus: {
      active: false, count: 0, tone: "quiet", ok: false, level: "Unknown", lastUpdated: new Date().toISOString(),
      checks: [{ source: "NWS alerts", state: "unavailable", asOf: "invalid", asOfBasis: "provider" }],
    } });
    const checks = container.querySelector("[data-pulse-source-checks]");
    expect(checks?.textContent).toContain("Unable to verify");
    expect(checks?.textContent).toContain("Source time unavailable");
    expect(checks?.querySelector("time")).toBeNull();
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
