// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PulseBoard, { type PulseHero, type PulseTile } from "./PulseBoard";
import PulseOfficialLinks from "./PulseOfficialLinks";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/Sheet", () => ({ default: () => null }));

const hero: PulseHero = {
  allClear: false, degraded: true, line: "Some county conditions are unconfirmed.", sub: "Check official notices.",
  renderedAt: Date.now(), countyStatus: {
    active: false, count: 0, tone: "quiet", ok: false, level: "Unknown", lastUpdated: new Date().toISOString(),
    checks: [{ source: "National Weather Service", state: "unavailable", asOf: null, asOfBasis: null }],
  },
};
const missing: PulseTile = {
  key: "alerts", label: "Official alerts", iconName: "CloudAlert", sourceLabel: "NWS + City + County",
  countLabel: "Feed unavailable", peek: "Some alert notices could not be checked.", accent: "var(--app-warning)",
  active: false, attention: false, availability: "unavailable", kind: "status", body: null,
};

function board(status: PulseHero, tiles: PulseTile[]) {
  const main = document.createElement("main");
  main.innerHTML = renderToStaticMarkup(createElement(PulseBoard, { hero: status, tiles, chips: [] }));
  return main;
}

describe("official alternatives during incomplete county coverage", () => {
  it("puts the alert fallback before the source ledger without calling a failed check clear", () => {
    const main = board(hero, [missing]);
    const primary = main.querySelector("[data-decision-action]");
    const checks = main.querySelector("[data-pulse-source-checks]");
    expect(primary?.textContent).toBe("Check official alerts");
    expect(primary!.compareDocumentPosition(checks!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.querySelector("h1")?.textContent).toBe(hero.line);
    const row = main.querySelector('[data-pulse-key="alerts"]')!;
    expect(row.textContent?.match(/Feed unavailable/g)).toHaveLength(1);
    expect(row.textContent).toContain(missing.peek);
  });

  it("keeps the confirmed lead action first when a different source fails", () => {
    const traffic = { ...missing, key: "traffic", label: "Traffic", availability: "current" as const };
    const main = board({ ...hero, leadKey: "traffic", actionLabel: "Check the road details" }, [traffic, missing]);
    expect(main.querySelector("[data-decision-action]")?.textContent).toBe("Check the road details");
  });

  it("offers local official public notices and a named river gauge", () => {
    const section = document.createElement("div");
    const urls = (topic: Parameters<typeof PulseOfficialLinks>[0]["topic"]) => {
      section.innerHTML = renderToStaticMarkup(createElement(PulseOfficialLinks, { topic }));
      return Array.from(section.querySelectorAll("a"), link => [link.textContent, link.href]);
    };
    expect(urls("alerts")).toHaveLength(3);
    expect(urls("roadwork")).toEqual([
      ["City road closures and detours", "https://www.cityoffrederickmd.gov/1619/Traffic"],
      ["County road closures", "https://www.frederickcountymd.gov/5052/Roads-Closed"],
    ]);
    expect(urls("rivers")).toEqual([["Monocacy River gauge near Frederick", "https://water.noaa.gov/gauges/FDKM2"]]);
  });
});
