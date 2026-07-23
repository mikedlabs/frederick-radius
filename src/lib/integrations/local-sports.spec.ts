import { describe, expect, it } from "vitest";
import {
  normalizeFccSportsRss,
  normalizeSidearmSports,
} from "./local-sports";

const HOOD = {
  id: "hood" as const,
  origin: "https://hoodathletics.com",
  teamName: "Hood College",
  teamNickname: "Blazers",
  calendarUrl: "https://hoodathletics.com/calendar",
};

describe("normalizeSidearmSports", () => {
  it("keeps home and away explicit and never carries away-game tickets", () => {
    const rows = normalizeSidearmSports(
      [
        {
          date: "2026-08-22T00:00:00",
          events: [
            {
              id: 10,
              date: "2026-08-22T17:00:00",
              time: "5:00 PM",
              location: "Frederick, Md.",
              location_indicator: "H",
              sport: { title: "Men's Soccer" },
              opponent: { title: "Frederick Community College" },
              media: {
                tickets: { url: "/tickets/10" },
                video: { url: "/watch/10" },
              },
              result: { status: "N" },
              facility: { title: "Thomas Athletic Field" },
            },
            {
              id: 11,
              date: "2026-08-29T17:00:00",
              time: "5:00 PM",
              location: "Westminster, Md.",
              location_indicator: "A",
              sport: { title: "Men's Soccer" },
              opponent: { title: "McDaniel College" },
              media: { tickets: { url: "https://tickets.example/away" } },
              result: { status: "N" },
            },
          ],
        },
      ],
      HOOD,
      "2026-07-23T12:00:00Z",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      homeAway: "home",
      ticketsUrl: "https://hoodathletics.com/tickets/10",
      watchUrl: "https://hoodathletics.com/watch/10",
      startsAt: "2026-08-22T21:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({
      homeAway: "away",
      ticketsUrl: null,
    });
  });

  it("uses a noon placeholder and marks a game TBA when no time is published", () => {
    const [game] = normalizeSidearmSports(
      [
        {
          events: [
            {
              id: 12,
              date: "2026-11-08T00:00:00",
              time: "",
              location_indicator: "N",
              sport: { title: "Cross Country" },
              opponent: { title: "Conference championship" },
              result: { status: "N" },
            },
          ],
        },
      ],
      HOOD,
    );

    expect(game.timeTba).toBe(true);
    expect(game.startsAt).toBe("2026-11-08T17:00:00.000Z");
  });

  it("normalizes final scores and official recap links", () => {
    const [game] = normalizeSidearmSports(
      [
        {
          events: [
            {
              id: 13,
              date: "2026-03-01T14:00:00",
              time: "2:00 PM",
              location_indicator: "H",
              sport: { title: "Baseball" },
              opponent: { title: "McDaniel College" },
              result: {
                status: "W",
                team_score: "7",
                opponent_score: "4",
                recap: { url: "/news/win" },
              },
            },
          ],
        },
      ],
      HOOD,
    );

    expect(game).toMatchObject({
      state: "final",
      result: "W",
      teamScore: "7",
      opponentScore: "4",
      recapUrl: "https://hoodathletics.com/news/win",
    });
  });
});

describe("normalizeFccSportsRss", () => {
  it("uses the official opponent marker to distinguish home and away games", () => {
    const rows = normalizeFccSportsRss(`<?xml version="1.0"?>
      <rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ps="http://www.prestosports.com/rss/schedule">
        <channel>
          <item>
            <link>https://fccathletics.com/sports/msoc/schedule#home-one</link>
            <description>Men's Soccer on Aug 19, 2026 at 5:00 PM: Washington Adventist, Frederick Community College</description>
            <category>Men's Soccer</category>
            <dc:date>2026-08-19T21:00:00Z</dc:date>
            <ps:score></ps:score>
            <ps:opponent>Washington Adventist</ps:opponent>
          </item>
          <item>
            <link>https://fccathletics.com/sports/msoc/schedule#away-one</link>
            <description>Men's Soccer on Aug 22, 2026 at 5:00 PM: Frederick Community College, Hood College</description>
            <category>Men's Soccer</category>
            <dc:date>2026-08-22T21:00:00Z</dc:date>
            <ps:score></ps:score>
            <ps:opponent>at Hood College</ps:opponent>
          </item>
        </channel>
      </rss>`);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "fcc-home-one",
      homeAway: "home",
      opponent: "Washington Adventist",
      venue: "Frederick Community College",
      timeTba: false,
    });
    expect(rows[1]).toMatchObject({
      id: "fcc-away-one",
      homeAway: "away",
      opponent: "Hood College",
      venue: null,
      timeTba: false,
    });
  });

  it("does not expose PrestoSports' generated timestamp as a TBA game time", () => {
    const [game] = normalizeFccSportsRss(`<?xml version="1.0"?>
      <rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ps="http://www.prestosports.com/rss/schedule">
        <channel>
          <item>
            <link>https://fccathletics.com/sports/wvball/2026-27/schedule#tba-one</link>
            <description>Women's Volleyball on Aug 22, 2026: Frederick Community College, TBA</description>
            <category>Women's Volleyball</category>
            <dc:date>2026-08-22T17:26:13Z</dc:date>
            <ps:score></ps:score>
            <ps:opponent>at TBA</ps:opponent>
          </item>
        </channel>
      </rss>`);

    expect(game).toMatchObject({
      id: "fcc-tba-one",
      timeTba: true,
      startsAt: "2026-08-22T16:00:00.000Z",
      homeAway: "away",
      opponent: "TBA",
    });
  });

  it("fails closed on malformed XML", () => {
    expect(normalizeFccSportsRss("")).toEqual([]);
  });
});
