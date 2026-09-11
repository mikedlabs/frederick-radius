import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";

const eventBySlug = new Map(EVENTS.map((event) => [event.slug, event]));

describe("reviewed static event sources", () => {
  it("keeps direct 2026 organizer pages on the three corroborated rows", () => {
    expect(eventBySlug.get("in-the-streets-frederick-2026")?.source_url).toBe(
      "https://www.celebratefrederick.com/calendar-event/in-the-street/",
    );
    expect(eventBySlug.get("baker-park-summer-concert-2026-06-07")?.source_url).toBe(
      "https://www.celebratefrederick.com/calendar-event/summer-concert-series-twentydollarprophet/",
    );
    expect(eventBySlug.get("fireworks-baker-park-2026-07-04")?.source_url).toBe(
      "https://www.celebratefrederick.com/calendar-event/fredericks-4th-an-independence-day-celebration-2/",
    );
  });

  it("requires a direct source URL on every verified non-curated row", () => {
    const unresolved = EVENTS.filter(
      (event) =>
        event.is_verified &&
        !event.source_url &&
        event.source !== "seed" &&
        event.source !== "manual",
    )
      .map((event) => event.slug)
      .sort();

    expect(unresolved).toEqual([]);
  });

  it("does not publish the four unsupported or contradicted static rows", () => {
    expect(
      [
        "carroll-creek-color-launch-2026",
        "first-friday-june-2026-frederick",
        "fourth-friday-may-2026-frederick",
        "saturday-farmers-market-frederick-2026-05-17",
      ].filter((slug) => eventBySlug.has(slug)),
    ).toEqual([]);
  });
});
