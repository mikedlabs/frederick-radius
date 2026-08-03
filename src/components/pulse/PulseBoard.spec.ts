import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AlertDataPanel,
  pulseClearedKeys,
  pulseDisplayGroups,
  pulseStatusWord,
  pulseTileBanks,
  pulseTileState,
  type PulseTile,
} from "./PulseBoard";

function tile(
  key: string,
  state: Partial<Pick<PulseTile, "active" | "attention" | "degraded">> = {},
): PulseTile {
  return {
    key,
    label: key,
    iconName: "Shield",
    sourceLabel: "Test source",
    countLabel: "Current",
    accent: "var(--app-cool)",
    active: state.active ?? false,
    attention: state.attention ?? false,
    degraded: state.degraded,
    kind: "status",
    body: null,
  };
}

describe("Pulse status language", () => {
  it("keeps missing data visually distinct from an active alert", () => {
    expect(pulseStatusWord({
      allClear: false,
      degraded: true,
      hasLead: false,
      tone: "warning",
    })).toBe("Partial data");

    expect(pulseStatusWord({
      allClear: true,
      degraded: true,
      hasLead: false,
      tone: "positive",
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

describe("Pulse smart blocks", () => {
  it("uses written states and lets unavailable data outrank activity", () => {
    expect(pulseTileState(tile("quiet"))).toBe("Current");
    expect(pulseTileState(tile("moving", { active: true }))).toBe("Active");
    expect(pulseTileState(tile("warning", { attention: true }))).toBe(
      "Attention",
    );
    expect(
      pulseTileState(
        tile("missing", { active: true, attention: true, degraded: true }),
      ),
    ).toBe("Feed unavailable");
    expect(
      pulseTileState({
        ...tile("partial", { active: true }),
        availability: "partial",
      }),
    ).toBe("Partial data");
    expect(
      pulseTileState({
        ...tile("disabled"),
        availability: "not-connected",
      }),
    ).toBe("Not connected");
  });

  it("keeps every tile in one stable bank and leaves unknown feeds visible", () => {
    const banks = pulseTileBanks([
      tile("traffic"),
      tile("weather"),
      tile("news"),
      tile("future-feed"),
    ]);

    expect(banks.map((bank) => bank.key)).toEqual([
      "conditions",
      "getting-around",
      "county-systems",
      "local-pulse",
      "more-signals",
    ]);
    expect(
      banks.flatMap((bank) => bank.tiles.map((entry) => entry.key)),
    ).toEqual(["weather", "traffic", "news", "future-feed"]);
  });

  it("puts actionable readings first and collapses quiet or degraded sources", () => {
    const lead = tile("alerts", { active: true, attention: true });
    const changed = tile("traffic", { active: true });
    const quiet = tile("weather");
    const disconnected: PulseTile = {
      ...tile("scanner", { active: true, attention: true }),
      availability: "not-connected",
    };
    const summarized = tile("power", { active: true, attention: true });

    const groups = pulseDisplayGroups(
      [lead, changed, quiet, disconnected, summarized],
      {
        leadKey: "alerts",
        summarizedKeys: new Set(["power"]),
      },
    );

    expect(groups.attention).toEqual([]);
    expect(groups.actionable.map((entry) => entry.key)).toEqual(["traffic"]);
    expect(groups.quiet.map((entry) => entry.key)).toEqual([
      "weather",
      "scanner",
    ]);
  });
});
