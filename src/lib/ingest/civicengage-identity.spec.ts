import { describe, expect, it, vi } from "vitest";
import {
  applyCivicEngageCatIds,
  assignCivicEngageCategories,
  buildCivicEngageCatIdIndex,
  civicEngageCategoryToken,
  civicEngageEventId,
  civicEngageICalUrl,
  eventIdsFromICalBody,
  fetchCivicEngageCatIdIndex,
  resolveCivicEngageCatId,
} from "./civicengage-identity";

describe("civicEngageEventId", () => {
  it("reads Calendar.aspx EID from the official page URL", () => {
    expect(
      civicEngageEventId({
        uid: "ignored",
        url: "https://www.frederickcountymd.gov/Calendar.aspx?EID=18872",
      }),
    ).toBe("18872");
  });

  it("accepts a numeric iCal UID", () => {
    expect(civicEngageEventId({ uid: "22352" })).toBe("22352");
  });

  it("reads a numeric mailbox local-part when the URL has no EID", () => {
    expect(
      civicEngageEventId({
        uid: "22352@www.cityoffrederickmd.gov",
        url: "/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=14",
      }),
    ).toBe("22352");
  });

  it("returns null when neither UID nor URL carries an EID", () => {
    expect(
      civicEngageEventId({
        uid: "not-an-eid",
        url: "https://www.frederickcountymd.gov/Calendar.aspx",
      }),
    ).toBeNull();
  });
});

describe("civicEngageICalUrl and category token", () => {
  it("builds the per-catID iCal URL the cron already fetches", () => {
    expect(civicEngageICalUrl("www.frederickcountymd.gov", 96)).toBe(
      "https://www.frederickcountymd.gov/Common/Modules/iCalendar/iCalendar.aspx?catID=96&feed=calendar",
    );
    expect(civicEngageCategoryToken(96)).toBe("96");
  });
});

describe("eventIdsFromICalBody", () => {
  it("collects UID and DESCRIPTION EID values from a VEVENT", () => {
    const ids = eventIdsFromICalBody(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:18872
DESCRIPTION:https://www.frederickcountymd.gov/calendar.aspx?EID=18872
URL:/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=96
END:VEVENT
END:VCALENDAR`);
    expect(ids).toEqual(["18872"]);
  });
});

describe("buildCivicEngageCatIdIndex and resolveCivicEngageCatId", () => {
  const index = buildCivicEngageCatIdIndex([
    { catID: 64, eventIds: ["15019", "19269"] },
    { catID: 96, eventIds: ["18872", "19269"] },
    { catID: 97, eventIds: ["19160", "19269"] },
  ]);

  it("resolves a unique EID to its catID", () => {
    expect(
      resolveCivicEngageCatId(index, {
        url: "https://www.frederickcountymd.gov/Calendar.aspx?EID=18872",
      }),
    ).toBe(96);
  });

  it("nulls a conflicting EID at ingest and keeps the first catID for live tagging", () => {
    const input = { uid: "19269" };
    expect(resolveCivicEngageCatId(index, input, "null")).toBeNull();
    expect(resolveCivicEngageCatId(index, input, "first")).toBe(64);
  });
});

describe("assignCivicEngageCategories", () => {
  it("writes the numeric catID and keeps one row per UID", () => {
    const { events, duplicates } = assignCivicEngageCategories([
      {
        catID: 14,
        events: [
          { uid: "22352", sourceUrl: "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352" },
        ],
      },
      {
        catID: 23,
        events: [{ uid: "21825" }],
      },
      {
        catID: 14,
        events: [
          { uid: "22352", sourceUrl: "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352" },
        ],
      },
    ]);

    expect(duplicates).toBe(1);
    expect(events).toEqual([
      {
        event: {
          uid: "22352",
          sourceUrl: "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22352",
        },
        catID: 14,
        category: "14",
      },
      { event: { uid: "21825" }, catID: 23, category: "23" },
    ]);
  });

  it("does not invent a catID when the same UID appears in two calendars", () => {
    const { events, duplicates } = assignCivicEngageCategories([
      { catID: 96, events: [{ uid: "19269" }] },
      { catID: 97, events: [{ uid: "19269" }] },
    ]);
    expect(duplicates).toBe(1);
    expect(events).toEqual([
      { event: { uid: "19269" }, catID: null, category: null },
    ]);
  });
});

describe("applyCivicEngageCatIds", () => {
  it("tags All-calendar RSS rows from their EID without adding a second row", () => {
    const index = buildCivicEngageCatIdIndex([
      { catID: 96, eventIds: ["18872"] },
      { catID: 14, eventIds: ["22869"] },
    ]);
    const tagged = applyCivicEngageCatIds(
      [
        {
          title: "Pickleball @ Brunswick",
          url: "https://www.frederickcountymd.gov/Calendar.aspx?EID=18872",
        },
        {
          title: "Unknown listing",
          url: "https://www.frederickcountymd.gov/Calendar.aspx?EID=1",
        },
      ],
      index,
    );

    expect(tagged).toHaveLength(2);
    expect(tagged[0]).toMatchObject({ civicengage_catid: 96 });
    expect(tagged[1]).not.toHaveProperty("civicengage_catid");
  });
});

describe("fetchCivicEngageCatIdIndex", () => {
  it("indexes EIDs from reachable per-catID iCals and skips a failed feed", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const catID = new URL(String(url)).searchParams.get("catID");
      if (catID === "96") {
        return new Response(
          "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:18872\nEND:VEVENT\nEND:VCALENDAR",
          { status: 200 },
        );
      }
      return new Response("", { status: 503 });
    });

    const index = await fetchCivicEngageCatIdIndex(
      "www.frederickcountymd.gov",
      [96, 97],
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(resolveCivicEngageCatId(index, { uid: "18872" })).toBe(96);
    expect(resolveCivicEngageCatId(index, { uid: "19160" })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops opening feeds once the index deadline has passed", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    const index = await fetchCivicEngageCatIdIndex(
      "www.frederickcountymd.gov",
      [96, 97, 64],
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        deadlineMs: 0,
      },
    );

    expect(index.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
