import { describe, expect, it } from "vitest";
import {
  nameListSentence,
  pulseAttentionChips,
  pulseClearedKeys,
  pulseDisplayGroups,
  pulseWideReadingKeys,
  secondarySignalsHeadline,
  secondarySignalsSummary,
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
  it("keeps calm readings out of Needs attention", () => {
    const calmAir = { tone: "cool", label: "Air good", key: "air" } as const;
    expect(
      pulseAttentionChips([calmAir], {
        allClear: true,
        showAlertData: false,
      }),
    ).toEqual([]);
    expect(
      pulseAttentionChips([calmAir], {
        allClear: false,
        showAlertData: false,
      }),
    ).toEqual([calmAir]);
  });

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

    expect(pulseStatusWord({
      allClear: false,
      degraded: true,
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
    // "All quiet", not "Checked" — PulseFreshness already prints "Checked Nm
    // ago" in the same masthead row, and the repeated word read as a stutter.
    expect(pulseStatusWord({
      allClear: true,
      degraded: false,
      hasLead: false,
      tone: "positive",
    })).toBe("All quiet");

    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: true,
      tone: "warning",
    })).toBe("Advisory");
  });

  it("calls a non-emergency service change a live update instead of all quiet", () => {
    expect(pulseStatusWord({
      allClear: false,
      degraded: false,
      hasLead: false,
      operational: true,
      tone: "cool",
    })).toBe("Live update");

    expect(pulseStatusWord({
      allClear: false,
      degraded: true,
      hasLead: false,
      operational: true,
      tone: "cool",
    })).toBe("Live update");
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

  it("keeps ambient measurements on the open board instead of behind the strip", () => {
    // The calm-day regression this split exists to prevent: the county's
    // temperature, AQI, and river height were the best-composed facts on the
    // page and rendered two taps deep inside "sources are quiet" — precisely
    // when nothing was wrong, which is most days.
    const weather: PulseTile = { ...tile("weather"), reading: true, kind: "feature" };
    const air: PulseTile = { ...tile("air"), reading: true, kind: "gauge" };
    const powerQuiet = tile("power");

    const groups = pulseDisplayGroups([weather, air, powerQuiet]);

    expect(groups.readings.map((entry) => entry.key)).toEqual(["weather", "air"]);
    expect(groups.quiet.map((entry) => entry.key)).toEqual(["power"]);
  });

  it("never lets a degraded or live tile claim the readings row", () => {
    // A reading flag describes the data a branch HOLDS. A feed that did not
    // answer has no number to show, and a live situation already outranks the
    // ambient row — so neither may render as a calm measurement.
    const degradedAir: PulseTile = { ...tile("air"), reading: true, degraded: true };
    const activeTraffic: PulseTile = { ...tile("traffic", { active: true }), reading: true };

    const groups = pulseDisplayGroups([degradedAir, activeTraffic]);

    expect(groups.readings).toEqual([]);
    expect(groups.quiet.map((entry) => entry.key)).toEqual(["air"]);
    expect(groups.actionable.map((entry) => entry.key)).toEqual(["traffic"]);
  });

  it("collapses a missing reading into the source-status disclosure", () => {
    const air: PulseTile = {
      ...tile("air"),
      reading: true,
      degraded: true,
    };

    const groups = pulseDisplayGroups([air]);

    expect(groups.readings).toEqual([]);
    expect(groups.quiet).toEqual([air]);
    expect(pulseTileState(groups.quiet[0])).toBe("Feed unavailable");
  });
});

describe("Pulse quiet-strip naming", () => {
  it("names what the strip holds instead of counting it", () => {
    // "12 sources are quiet" made a reader open the strip just to learn
    // whether the thing they cared about was inside.
    expect(nameListSentence(["Power out"])).toBe("Power out");
    expect(nameListSentence(["Power out", "Schools"])).toBe("Power out and Schools");
    expect(nameListSentence(["Power out", "311 reports", "Schools"])).toBe(
      "Power out, 311 reports, and Schools",
    );
    expect(nameListSentence([])).toBe("");
  });

  it("never describes unavailable checks as all clear", () => {
    expect(secondarySignalsHeadline(0, 0)).toBe("Other source checks");
    expect(secondarySignalsHeadline(2, 0)).toBe("Some source checks are incomplete");
    expect(secondarySignalsHeadline(0, 1)).toBe("Some source checks are unavailable");
    expect(secondarySignalsHeadline(4, 2)).toBe("Some source checks are unavailable");
    expect(secondarySignalsHeadline(0, 0, 1)).toBe("Some sources are not connected");
  });

  it("summarizes degraded checks without contradicting the active alert above", () => {
    expect(secondarySignalsSummary(12, 1, 3)).toBe(
      "4 of 12 checks did not return complete data. Open for source details.",
    );
    expect(secondarySignalsSummary(1, 0, 0)).toBe(
      "1 supporting check has no additional active report.",
    );
    expect(secondarySignalsSummary(12, 1, 0, 2)).toBe(
      "1 of 10 connected checks did not return complete data. 2 sources are not connected. Open for source details.",
    );
  });

  it("fills the last mobile grid seat without changing wider layouts", () => {
    const weather = { ...tile("weather"), kind: "feature" as const };
    const river = { ...tile("river"), kind: "gauge" as const };
    const air = { ...tile("air"), kind: "gauge" as const };

    expect([...pulseWideReadingKeys([weather, river])]).toEqual(["river"]);
    expect([...pulseWideReadingKeys([weather, river, air])]).toEqual([]);
  });
});
