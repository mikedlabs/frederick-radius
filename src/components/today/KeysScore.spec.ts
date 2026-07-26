import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KeysScore as Score } from "@/lib/integrations/keysScore";
import { KeysPregameMatchup, keysScoreAction } from "./KeysScore";

const officialSchedule = "https://www.milb.com/frederick/schedule";

function pregame(keysHome: boolean): Score {
  return {
    gamePk: 123,
    state: "pre",
    detailedState: "Scheduled",
    keysHome,
    keys: { name: "Frederick Keys", runs: null },
    opponent: { name: "West Virginia Black Bears", runs: null },
    inningOrdinal: null,
    inningState: null,
    outs: null,
    startsAt: "2026-07-26T23:05:00.000Z",
    url: officialSchedule,
  };
}

describe("keysScoreAction", () => {
  it("offers tickets before a home game", () => {
    expect(
      keysScoreAction({
        keysHome: true,
        state: "pre",
        url: officialSchedule,
      }),
    ).toEqual({
      href: "https://www.milb.com/frederick/tickets",
      label: "Home game tickets",
      isTickets: true,
    });
  });

  it("never offers Frederick tickets for an away game", () => {
    expect(
      keysScoreAction({
        keysHome: false,
        state: "pre",
        url: officialSchedule,
      }),
    ).toEqual({
      href: officialSchedule,
      label: "Official Keys schedule",
      isTickets: false,
    });
  });

  it("uses the official schedule after a home game starts", () => {
    expect(
      keysScoreAction({
        keysHome: true,
        state: "live",
        url: officialSchedule,
      }),
    ).toEqual({
      href: officialSchedule,
      label: "Official Keys schedule",
      isTickets: false,
    });
  });
});

describe("KeysPregameMatchup", () => {
  it("shows a compact home matchup and first-pitch time without empty score placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(KeysPregameMatchup, { score: pregame(true) }),
    );

    expect(html).toContain('data-testid="keys-pregame-matchup"');
    expect(html).toContain("Home · Nymeo Field");
    expect(html).toContain("Frederick Keys");
    expect(html).toContain("West Virginia Black Bears");
    expect(html).toContain("First pitch");
    expect(html).toContain(">7:05 PM</time>");
    expect(html).not.toContain("–");
  });

  it("labels an away matchup before the user opens the official schedule", () => {
    const html = renderToStaticMarkup(
      createElement(KeysPregameMatchup, { score: pregame(false) }),
    );

    expect(html).toContain(">Away</p>");
    expect(html).toContain(">at</span>");
    expect(html).not.toContain("Nymeo Field");
  });
});
