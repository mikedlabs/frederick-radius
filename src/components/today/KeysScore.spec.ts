import { describe, expect, it } from "vitest";
import { keysScoreAction } from "./KeysScore";

const officialSchedule = "https://www.milb.com/frederick/schedule";

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
