import { describe, expect, it } from "vitest";
import {
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
});
