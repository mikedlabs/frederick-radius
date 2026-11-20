import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({ getSql: vi.fn<() => unknown>(() => null) }));
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));

import {
  RELATED_PAGE_SIZE,
  archivedUpcoming,
  buildRelatedEventSections,
  loadRelatedEventSections,
} from "./eventRelated";

function event(
  slug: string,
  startsAt: string,
  venue = "Test venue",
): EventWithMeta {
  return {
    slug,
    title: slug.replace(/-\d+$/, ""),
    description: "",
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    timezone: "America/New_York",
    is_recurring: true,
    venue_name: venue,
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: slug,
    source_url: "https://example.com",
    license: "test",
    first_seen_at: startsAt,
    last_verified_at: startsAt,
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("buildRelatedEventSections", () => {
  it("builds bounded series and same-venue shelves from archived snapshots", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const current = event(
      "weekly-jazz-1",
      "2030-01-02T23:00:00.000Z",
      "The Venue",
    );
    const nextDate = event(
      "weekly-jazz-2",
      "2030-01-09T23:00:00.000Z",
      "The Venue",
    );
    const differentTitleSameVenue = {
      ...event(
        "film-night",
        "2030-01-03T23:00:00.000Z",
        "The Venue",
      ),
      title: "Film Night",
      is_recurring: false,
    };
    const secondSameVenue = {
      ...event(
        "author-talk",
        "2030-01-04T23:00:00.000Z",
        "The Venue",
      ),
      title: "Author Talk",
      is_recurring: false,
    };

    const result = buildRelatedEventSections(current, now, [
      nextDate,
      differentTitleSameVenue,
      secondSameVenue,
    ]);

    expect(result.lineup.map((row) => row.slug)).toEqual(["weekly-jazz-2"]);
    expect(result.moreUpcoming.title).toBe("More at The Venue");
    expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
      "film-night",
      "author-talk",
    ]);
  });

  it("keeps a publisher-labeled season finale in the stated recurring series", () => {
    const now = new Date("2030-08-27T14:00:00.000Z");
    const recurrence = "Every Thursday, May 7 - September 24, 2030";
    const publisher = "https://publisher.example/riverfront-thursdays";
    const current = {
      ...event(
        "riverfront-thursdays-2030-08-27",
        "2030-08-27T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays · Current Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };
    const next = {
      ...event(
        "riverfront-thursdays-2030-09-03",
        "2030-09-03T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays · Next Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };
    const finale = {
      ...event(
        "riverfront-thursdays-2030-09-24",
        "2030-09-24T21:00:00.000Z",
        "Riverfront Stage",
      ),
      title: "Riverfront Thursdays: Season Finale · Final Artist",
      recurrence_text: recurrence,
      source_url: publisher,
    };

    const result = buildRelatedEventSections(current, now, [next, finale]);

    expect(result.lineup.map((row) => row.slug)).toEqual([
      "riverfront-thursdays-2030-09-03",
      "riverfront-thursdays-2030-09-24",
    ]);
    expect(result.lineup.at(-1)).toMatchObject({
      starts_at: "2030-09-24T21:00:00.000Z",
      recurrence_text: recurrence,
      source_url: publisher,
    });
  });

  // November 11, 2026 hierarchy audit: an Emmitsburg event offered only
  // Frederick events as "more upcoming".
  describe("town context", () => {
    const now = new Date("2030-03-01T12:00:00.000Z");
    function inTown(
      slug: string,
      startsAt: string,
      municipality: string,
      venue: string,
    ): EventWithMeta {
      return {
        ...event(slug, startsAt, venue),
        title: slug.replace(/-/g, " "),
        is_recurring: false,
        municipality,
        municipality_name: municipality === "emmitsburg" ? "Emmitsburg" : "Frederick City",
      };
    }
    const current = inTown("game-time", "2030-03-02T17:00:00.000Z", "emmitsburg", "Emmitsburg Branch Library");
    const frederickSooner = inTown("downtown-concert", "2030-03-02T19:00:00.000Z", "frederick", "Weinberg Center");
    const emmitsburgOne = inTown("pancake-breakfast", "2030-03-05T13:00:00.000Z", "emmitsburg", "Vigilant Hose Company");
    const emmitsburgTwo = inTown("trail-cleanup", "2030-03-07T14:00:00.000Z", "emmitsburg", "Community Park");

    it("leads with the same town even when county events start sooner", () => {
      const result = buildRelatedEventSections(current, now, [
        frederickSooner,
        emmitsburgOne,
        emmitsburgTwo,
      ]);
      expect(result.moreUpcoming.title).toBe("More in Emmitsburg");
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "trail-cleanup",
      ]);
    });

    it("names the county when nothing else is scheduled in the town", () => {
      const result = buildRelatedEventSections(current, now, [frederickSooner]);
      expect(result.moreUpcoming.title).toBe("Elsewhere in Frederick County");
      expect(result.moreUpcoming.items.map((row) => row.municipality)).toEqual(["frederick"]);
    });

    it("puts a single same-town event ahead of county events", () => {
      const result = buildRelatedEventSections(current, now, [frederickSooner, emmitsburgOne]);
      expect(result.moreUpcoming.title).toBe("More upcoming events");
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "downtown-concert",
      ]);
    });

    it("never offers a closure notice or a meeting as something else to do", () => {
      const closure = { ...inTown("closure", "2030-03-03T05:00:00.000Z", "emmitsburg", "Emmitsburg"), title: "Town Offices Closed" };
      const meeting = { ...inTown("meeting", "2030-03-03T23:00:00.000Z", "emmitsburg", "Town Office"), title: "Planning Commission" };
      const result = buildRelatedEventSections(current, now, [closure, meeting, emmitsburgOne, emmitsburgTwo]);
      expect(result.moreUpcoming.items.map((row) => row.slug)).toEqual([
        "pancake-breakfast",
        "trail-cleanup",
      ]);
    });
  });

  it("leaves closures and meetings out of a recurring lineup", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    const current = event("weekly-jazz-1", "2030-01-02T23:00:00.000Z", "The Venue");
    const nextDate = event("weekly-jazz-2", "2030-01-09T23:00:00.000Z", "The Venue");
    // Same series key as the lineup, but not something a person can attend.
    const closure = { ...event("weekly-jazz-3", "2030-01-16T23:00:00.000Z", "The Venue"), title: "weekly-jazz", category: "civic" };
    const result = buildRelatedEventSections(current, now, [nextDate, closure]);
    expect(result.lineup.map((row) => row.slug)).toEqual(["weekly-jazz-2"]);
  });
});

// The archive reads run in SQL with a row limit, but the public-event filter
// runs on the hydrated snapshot. These fake the tagged-template driver with
// the same filters, keyset cursor and limit the statement applies.
describe("archive reads", () => {
  type Row = { id: string; canonical_slug: string; snapshot: EventWithMeta; cursor_at: string };
  function fakeSql(rows: Row[]) {
    const calls: Array<{ municipality: unknown; venue: unknown }> = [];
    const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const [, , municipality, , venue, , cursorAt, cursorId, limit] = values as [
        string, string, string | null, string | null, string | null, string | null, string, string, number,
      ];
      calls.push({ municipality, venue });
      const page = rows
        .filter((row) => municipality === null || row.snapshot.municipality === municipality)
        .filter((row) => venue === null || row.snapshot.venue_place_slug === venue)
        .filter((row) => {
          const at = Date.parse(row.cursor_at);
          const cursor = Date.parse(cursorAt);
          return at > cursor || (at === cursor && row.id > cursorId);
        })
        .sort((a, b) => Date.parse(a.cursor_at) - Date.parse(b.cursor_at) || a.id.localeCompare(b.id))
        .slice(0, limit);
      return Promise.resolve(page);
    };
    return { sql, calls };
  }
  function row(index: number, overrides: Partial<EventWithMeta>): Row {
    const startsAt = new Date(Date.parse("2030-03-02T00:00:00.000Z") + index * 3_600_000).toISOString();
    const slug = `${overrides.title ?? "row"}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const snapshot = { ...event(slug, startsAt), is_recurring: false, ...overrides };
    return { id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`, canonical_slug: slug, snapshot, cursor_at: startsAt };
  }
  const now = new Date("2030-03-01T12:00:00.000Z");

  afterEach(() => mocks.getSql.mockReset());

  it("pages past a full page of closures and meetings to reach public events", async () => {
    const notices = Array.from({ length: RELATED_PAGE_SIZE }, (_, index) =>
      row(index, { title: index % 2 ? "Town Offices Closed" : "Planning Commission" }));
    const concert = row(RELATED_PAGE_SIZE + 1, { title: "Spring Concert" });
    const { sql } = fakeSql([...notices, concert]);
    mocks.getSql.mockReturnValue(sql);
    const result = await archivedUpcoming(now);
    expect(result.map((item) => item.title)).toEqual(["Spring Concert"]);
  });

  it("reads the venue separately so earlier town rows cannot hide it", async () => {
    const townRows = Array.from({ length: 40 }, (_, index) =>
      row(index, { title: `Town Event ${index}`, municipality: "emmitsburg", venue_place_slug: "other-hall" }));
    const venueOne = row(50, { title: "Story Time", municipality: "emmitsburg", venue_name: "Emmitsburg Branch", venue_place_slug: "emmitsburg-branch" });
    const venueTwo = row(51, { title: "Lego Club", municipality: "emmitsburg", venue_name: "Emmitsburg Branch", venue_place_slug: "emmitsburg-branch" });
    const { sql, calls } = fakeSql([...townRows, venueOne, venueTwo]);
    mocks.getSql.mockReturnValue(sql);
    const current = {
      ...event("game-time", "2030-03-02T00:30:00.000Z", "Emmitsburg Branch"),
      is_recurring: false,
      municipality: "emmitsburg",
      venue_place_slug: "emmitsburg-branch",
    };
    const result = await loadRelatedEventSections(current, now);
    expect(calls).toContainEqual({ municipality: null, venue: "emmitsburg-branch" });
    expect(calls).toContainEqual({ municipality: "emmitsburg", venue: null });
    expect(result.moreUpcoming.title).toBe("More at Emmitsburg Branch");
    expect(result.moreUpcoming.items.map((item) => item.title)).toEqual(["Story Time", "Lego Club"]);
  });
});

