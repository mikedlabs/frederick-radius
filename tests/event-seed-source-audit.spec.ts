import { describe, expect, it } from "vitest";
import { EVENTS } from "@/data/events";

const eventBySlug = new Map(EVENTS.map((event) => [event.slug, event]));

describe("reviewed static event sources", () => {
  it("keeps the Fair listing aligned with the reviewed 2026 admission page", () => {
    const fair = eventBySlug.get("great-frederick-fair-2026");

    expect(fair).toMatchObject({
      source_url: "https://thegreatfrederickfair.com/come-to-the-fair/",
      last_verified_at: "2026-09-20T15:35:48.000Z",
      is_free: false,
      price_text:
        "$10 online / $15 at the gate (ages 11+); free for ages 10 and under",
      // The overall range starts at Friday's gate opening and ends at the
      // final Saturday's gate closing, both in Eastern daylight time.
      starts_at: "2026-09-18T20:00:00.000Z",
      ends_at: "2026-09-27T02:00:00.000Z",
    });
    expect(fair?.info?.admission).toBe(
      "Gate admission does not include carnival rides or ticketed Grandstand events. Advance Grandstand tickets include gate admission on the performance day.",
    );
    expect(fair?.description).toContain("Check the official schedule for daily hours.");
    expect(fair?.description).not.toContain("demolition derby on closing Saturday");
  });

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
