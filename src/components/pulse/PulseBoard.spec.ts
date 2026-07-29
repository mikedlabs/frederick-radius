import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AlertDataPanel,
  SystemsLedger,
  pulseClearedKeys,
  pulseMoreCheckLabel,
  pulseStatusWord,
  pulseTilesWithData,
  pulseTilesWithoutData,
  type PulseTile,
} from "./PulseBoard";

describe("Pulse status language", () => {
  it("keeps missing data visually distinct from an active alert", () => {
    expect(pulseStatusWord({
      allClear: false,
      degraded: true,
      hasLead: false,
      tone: "warning",
    })).toBe("Partial data");

    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: true,
      tone: "danger",
    })).toBe("Urgent");
  });

  it("never lets a contradictory all-clear flag hide partial data", () => {
    expect(pulseStatusWord({
      allClear: true,
      degraded: true,
      hasLead: false,
      tone: "positive",
    })).toBe("Partial data");
  });

  it("keeps verified quiet conditions separate from advisories", () => {
    expect(pulseStatusWord({
      allClear: true,
      degraded: false,
      hasLead: false,
      tone: "positive",
    })).toBe("Checked");

    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: true,
      tone: "warning",
    })).toBe("Advisory");
  });

  it("routes unavailable feeds to More checks instead of the visible briefing", () => {
    const tile = (key: string, degraded = false): PulseTile => ({
      key,
      label: key,
      iconName: "CloudSun",
      sourceLabel: "Test source",
      countLabel: degraded ? "No fresh reading" : "Current",
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      degraded,
      kind: "status",
      body: null,
    });

    const tiles = [
      tile("weather"),
      tile("air", true),
      tile("traffic"),
    ];

    expect(pulseTilesWithData(tiles).map((item) => item.key)).toEqual([
      "weather",
      "traffic",
    ]);
    expect(pulseTilesWithoutData(tiles).map((item) => item.key)).toEqual([
      "air",
    ]);
  });

  it("labels degraded checks without presenting missing data as clear", () => {
    const degradedTile = (active: boolean, countLabel: string): PulseTile => ({
      key: "alerts",
      label: "Official alerts",
      iconName: "CloudAlert",
      sourceLabel: "Test source",
      countLabel,
      accent: "var(--app-warning)",
      active,
      attention: active,
      degraded: true,
      kind: "status",
      body: null,
    });

    expect(pulseMoreCheckLabel(degradedTile(false, "No current notices"))).toBe(
      "Unavailable",
    );
    expect(pulseMoreCheckLabel(degradedTile(true, "2 current notices"))).toBe(
      "Last confirmed: 2 current notices",
    );
  });

  it("does not report an unavailable feed as cleared since the last look", () => {
    const tile = (
      key: string,
      attention: boolean,
      degraded = false,
    ): PulseTile => ({
      key,
      label: key,
      iconName: "CloudAlert",
      sourceLabel: "Test source",
      countLabel: attention ? "1 active" : "No active issue",
      accent: "var(--app-warning)",
      active: attention,
      attention,
      degraded,
      kind: "status",
      body: null,
    });

    expect(
      pulseClearedKeys(
        { alerts: "1 active", traffic: "1 active" },
        [
          tile("alerts", false, true),
          tile("traffic", false),
        ],
      ),
    ).toEqual(["traffic"]);
  });

  it("renders a degraded feed only in More checks and calls it unavailable", () => {
    const tile = (
      key: string,
      label: string,
      countLabel: string,
      degraded = false,
    ): PulseTile => ({
      key,
      label,
      iconName: "CloudSun",
      sourceLabel: "Test source",
      countLabel,
      accent: "var(--app-cool)",
      active: false,
      attention: false,
      degraded,
      kind: "status",
      body: null,
    });

    const tiles = [
      tile("weather", "Weather", "Mostly sunny"),
      tile("air", "Air quality", "No active advisory", true),
    ];
    const available = pulseTilesWithData(tiles);
    const unavailable = pulseTilesWithoutData(tiles);
    const html = renderToStaticMarkup(
      createElement(SystemsLedger, {
        tiles: unavailable,
        onOpen: () => undefined,
      }),
    );

    expect(available.map((item) => item.key)).toEqual(["weather"]);
    expect(unavailable.map((item) => item.key)).toEqual(["air"]);
    expect(html).toContain("More checks");
    expect(html).toContain("1 unavailable");
    expect(html).toContain('aria-label="Air quality: Unavailable"');
    expect(html).not.toContain("Air quality: No active advisory");
    expect(html).not.toContain(">No active advisory<");
    expect(html.match(/>Air quality</g)).toHaveLength(1);
  });

  it("keeps every alert fact caption at the 11px mobile floor", () => {
    const lead: PulseTile = {
      key: "air",
      label: "Air quality",
      iconName: "CloudAlert",
      sourceLabel: "AirNow",
      countLabel: "AQI 151",
      accent: "var(--app-warning)",
      active: true,
      attention: true,
      kind: "status",
      body: null,
    };
    const html = renderToStaticMarkup(
      createElement(AlertDataPanel, {
        facts: [
          { label: "Current AQI", value: "151", detail: "Frederick" },
          { label: "Observed", value: "12:05 PM" },
        ],
        lead,
        meta: "Observed 5 minutes ago",
        actionLabel: "See the air-quality reading",
        color: "var(--app-warning)",
        onOpen: () => undefined,
      }),
    );

    expect(html).toContain("text-caption");
    expect(html).not.toMatch(/text-\[(?:8\.5|9\.5|10)px\]/);
  });
});
