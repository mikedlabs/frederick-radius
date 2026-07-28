import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return { ...actual, getDb: mocks.getDb };
});

import { ICAL_FETCH_TIMEOUT_MS, ingestICal } from "./ical";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Frederick Radius ingest test//EN
BEGIN:VEVENT
UID:concert-1
DTSTAMP:20980101T120000Z
DTSTART;TZID=America/New_York:20990110T193000
DTEND;TZID=America/New_York:20990110T213000
SUMMARY:Creekside Concert
DESCRIPTION:Free community music
LOCATION:Carroll Creek Park, Frederick MD 21701
URL:https://events.example/creekside-concert
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Frederick Radius all-day ingest test//EN
BEGIN:VEVENT
UID:winter-festival
DTSTAMP:20980101T120000Z
DTSTART;VALUE=DATE:20990110
DTEND;VALUE=DATE:20990112
SUMMARY:Winter Festival
LOCATION:Baker Park, Frederick MD 21701
END:VEVENT
BEGIN:VEVENT
UID:independence-day
DTSTAMP:20980101T120000Z
DTSTART;VALUE=DATE:20990704
SUMMARY:Independence Day
LOCATION:Frederick, MD
END:VEVENT
END:VCALENDAR`;

function fakeDb({
  eventWriteOutcomes = [],
}: {
  eventWriteOutcomes?: Array<"resolve" | "reject">;
} = {}) {
  const returning = vi.fn().mockResolvedValue([{ id: "run-1" }]);
  let eventWrite = 0;
  const onConflictDoUpdate = vi.fn((_options?: unknown) => {
    const outcome = eventWriteOutcomes[eventWrite++];
    return outcome === "reject"
      ? Promise.reject(new Error(`event write ${eventWrite} failed`))
      : Promise.resolve(undefined);
  });
  const values = vi.fn((row: Record<string, unknown>) => {
    if ("title" in row) return { onConflictDoUpdate };
    return { returning };
  });
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn((_row?: Record<string, unknown>) => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { db: { insert, update }, values, onConflictDoUpdate, set };
}

describe("ingestICal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches with the platform runtime, parses through the shared parser, and preserves the event mapping", async () => {
    const { db, values, onConflictDoUpdate } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(SAMPLE, {
        status: 200,
        headers: { "content-type": "text/calendar" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toEqual({
      source_slug: "test_calendar",
      records_in: 1,
      records_upserted: 1,
      records_failed: 0,
      status: "ok",
      error: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://events.example/calendar.ics",
      expect.objectContaining({ cache: "no-store", redirect: "follow" }),
    );
    const eventRow = values.mock.calls
      .map(([row]) => row as Record<string, unknown>)
      .find((row) => row.title === "Creekside Concert");
    expect(eventRow).toMatchObject({
      venue_name: "Carroll Creek Park",
      address: "Carroll Creek Park, Frederick MD 21701",
      municipality_slug: "frederick",
      category_slug: "music",
      ticket_url: "https://events.example/creekside-concert",
      source: "test_calendar",
      source_record_id: "concert-1",
      lng: -77.4109,
      lat: 39.4137,
    });
    expect(eventRow?.starts_at).toEqual(new Date("2099-01-11T00:30:00.000Z"));
    expect(eventRow?.ends_at).toEqual(new Date("2099-01-11T02:30:00.000Z"));
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("preserves explicit and default exclusive all-day ends through the database upsert", async () => {
    const { db, values, onConflictDoUpdate } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(ALL_DAY_SAMPLE, { status: 200 })),
    );

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toMatchObject({
      records_in: 2,
      records_upserted: 2,
      records_failed: 0,
      status: "ok",
    });
    const eventRows = values.mock.calls
      .map(([row]) => row as Record<string, unknown>)
      .filter((row) => typeof row.title === "string");
    expect(eventRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Winter Festival",
          starts_at: new Date("2099-01-10T05:00:00.000Z"),
          ends_at: new Date("2099-01-12T05:00:00.000Z"),
          is_all_day: true,
        }),
        expect.objectContaining({
          title: "Independence Day",
          starts_at: new Date("2099-07-04T04:00:00.000Z"),
          ends_at: new Date("2099-07-05T04:00:00.000Z"),
          is_all_day: true,
        }),
      ]),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2);
    for (const [options] of onConflictDoUpdate.mock.calls) {
      expect(options).toMatchObject({
        set: { is_all_day: true },
      });
    }
  });

  it("returns a source-scoped error when the calendar fetch fails", async () => {
    const { db, values } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toMatchObject({
      source_slug: "test_calendar",
      records_in: 0,
      records_upserted: 0,
      records_failed: 0,
      status: "error",
      error: "iCal fetch failed with HTTP 503",
    });
    expect(
      values.mock.calls.some(([row]) => (row as Record<string, unknown>).title),
    ).toBe(false);
  });

  it("marks a malformed HTTP-200 payload as an error instead of a healthy empty feed", async () => {
    const { db, values, set } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><h1>Temporarily unavailable</h1></html>", { status: 200 }),
      ),
    );

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toMatchObject({
      records_in: 0,
      records_upserted: 0,
      records_failed: 0,
      status: "error",
      error: "iCal parse failed: invalid iCalendar payload",
    });
    expect(
      values.mock.calls.some(([row]) => (row as Record<string, unknown>).title),
    ).toBe(false);
    expect(set.mock.calls.map(([row]) => row)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "error" }),
        expect.objectContaining({
          last_status: "error: iCal parse failed: invalid iCalendar payload",
        }),
      ]),
    );
  });

  it("reports partial when some event writes fail and preserves successful writes", async () => {
    const { db, set } = fakeDb({
      eventWriteOutcomes: ["reject", "resolve"],
    });
    mocks.getDb.mockReturnValue(db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(ALL_DAY_SAMPLE, { status: 200 })),
    );

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toMatchObject({
      records_in: 2,
      records_upserted: 1,
      records_failed: 1,
      status: "partial",
      error: "1 of 2 event write failed: event write 1 failed",
    });
    expect(set.mock.calls.map(([row]) => row)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "partial",
          records_upserted: 1,
          records_failed: 1,
        }),
        expect.objectContaining({
          last_status: "partial: 1 of 2 event write failed: event write 1 failed",
        }),
      ]),
    );
  });

  it("reports error when every event write fails", async () => {
    const { db, set } = fakeDb({
      eventWriteOutcomes: ["reject", "reject"],
    });
    mocks.getDb.mockReturnValue(db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(ALL_DAY_SAMPLE, { status: 200 })),
    );

    const result = await ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });

    expect(result).toMatchObject({
      records_in: 2,
      records_upserted: 0,
      records_failed: 2,
      status: "error",
      error: "all 2 event writes failed: event write 1 failed",
    });
    expect(set.mock.calls.map(([row]) => row)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "error",
          records_upserted: 0,
          records_failed: 2,
        }),
        expect.objectContaining({
          last_status: "error: all 2 event writes failed: event write 1 failed",
        }),
      ]),
    );
  });

  it("aborts a hung calendar fetch at the source-scoped timeout", async () => {
    vi.useFakeTimers();
    const { db } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = ingestICal({
      source_slug: "test_calendar",
      url: "https://events.example/calendar.ics",
      defaultMunicipality: "frederick",
      defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
    });
    await vi.advanceTimersByTimeAsync(ICAL_FETCH_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result).toMatchObject({
      status: "error",
      error: `iCal fetch timed out after ${ICAL_FETCH_TIMEOUT_MS}ms`,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
