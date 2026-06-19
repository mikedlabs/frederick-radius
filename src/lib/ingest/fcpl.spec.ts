import { describe, it, expect } from "vitest";
import {
  localToUtcIso,
  fcplMunicipality,
  fcplCategory,
  fcplFieldString,
  fcplMapOne,
  fcplMapFeed,
} from "./fcpl";

const NOW = new Date("2026-06-19T12:00:00Z");

describe("localToUtcIso — ET wall time to UTC", () => {
  it("converts an EDT (summer) time, UTC-4", () => {
    expect(localToUtcIso("2026-06-20 09:00:00")).toBe("2026-06-20T13:00:00.000Z");
  });
  it("converts an EST (winter) time, UTC-5", () => {
    expect(localToUtcIso("2026-01-10 18:30:00")).toBe("2026-01-10T23:30:00.000Z");
  });
  it("returns null for junk", () => {
    expect(localToUtcIso("")).toBeNull();
    expect(localToUtcIso(undefined)).toBeNull();
  });
});

describe("fcplFieldString — string or {id: label} object", () => {
  it("passes a plain string through", () => {
    expect(fcplFieldString("Brunswick Branch Library")).toBe("Brunswick Branch Library");
  });
  it("joins an object's values", () => {
    expect(fcplFieldString({ "87": "Around the Community" })).toBe("Around the Community");
  });
  it("is empty for null", () => {
    expect(fcplFieldString(null)).toBe("");
  });
});

describe("fcplMunicipality — branch to town slug", () => {
  it("maps each branch to its town", () => {
    expect(fcplMunicipality("Brunswick Branch Library")).toBe("brunswick");
    expect(fcplMunicipality("Thurmont Regional Library")).toBe("thurmont");
    expect(fcplMunicipality("Urbana Regional Library")).toBe("urbana");
    expect(fcplMunicipality("Myersville Community Library")).toBe("myersville");
    expect(fcplMunicipality("C. Burr Artz Public Library")).toBe("frederick");
    expect(fcplMunicipality("Edward F. Fry Memorial Library at Point of Rocks")).toBe("brunswick");
  });
  it("falls back to the county seat for system-wide / unknown", () => {
    expect(fcplMunicipality("Around the Community")).toBe("frederick");
    expect(fcplMunicipality("C. Burr Artz Public Library / Brunswick Branch Library / Thurmont Regional Library")).toBe("frederick");
  });
});

describe("fcplCategory — program type + audience to category slug", () => {
  it("maps storytime / kids audiences to family", () => {
    expect(fcplCategory("Recurring Storytime", "Birth - 5")).toBe("family");
    expect(fcplCategory("Education & Enjoyment", "Elementary")).toBe("family");
  });
  it("maps wellness to wellness", () => {
    expect(fcplCategory("Wellness", "Adult")).toBe("wellness");
  });
  it("defaults adult learning to community", () => {
    expect(fcplCategory("Education & Enjoyment", "Adult")).toBe("community");
  });
});

describe("fcplMapOne — raw record to a ParsedEvent", () => {
  const base = {
    title: "Toddler Storytime",
    id: "206823",
    public: true,
    published: true,
    url: "https://frederick.librarycalendar.com/event/toddler-storytime-206823",
    changed: "2026-05-06 15:28:03",
    start_date: "2026-06-20 09:00:00",
    end_date: "2026-06-20 09:45:00",
    timezone: "America/New_York",
    branch: "Brunswick Branch Library",
    room: "Story Room",
    program_type: "Recurring Storytime",
    age_group: "Birth - 5",
    description: "Songs and stories for toddlers.",
  };

  it("maps a public future event with the right shape", () => {
    const m = fcplMapOne(base, NOW);
    expect(m).not.toBeNull();
    expect(m!.municipality).toBe("brunswick");
    expect(m!.category).toBe("family");
    expect(m!.event.uid).toBe("206823");
    expect(m!.event.summary).toBe("Toddler Storytime");
    expect(m!.event.startsAtUtc).toBe("2026-06-20T13:00:00.000Z");
    expect(m!.event.endsAtUtc).toBe("2026-06-20T13:45:00.000Z");
    expect(m!.event.sourceUrl).toBe(base.url);
    expect(m!.event.rawLocation).toBe("Brunswick Branch Library, Story Room");
    expect(m!.event.allDay).toBe(false);
  });

  it("drops a non-public event", () => {
    expect(fcplMapOne({ ...base, public: false }, NOW)).toBeNull();
  });

  it("drops a past event", () => {
    expect(fcplMapOne({ ...base, start_date: "2026-06-01 09:00:00" }, NOW)).toBeNull();
  });

  it("drops a record with no title or id", () => {
    expect(fcplMapOne({ ...base, title: "" }, NOW)).toBeNull();
    expect(fcplMapOne({ ...base, id: undefined, uuid: undefined }, NOW)).toBeNull();
  });
});

describe("fcplMapFeed — filters the whole feed", () => {
  it("keeps only usable public future rows", () => {
    const feed = [
      { title: "Good", id: "1", public: true, start_date: "2026-06-20 10:00:00", branch: "Thurmont Regional Library" },
      { title: "Past", id: "2", public: true, start_date: "2026-01-01 10:00:00", branch: "Thurmont Regional Library" },
      { title: "Private", id: "3", public: false, start_date: "2026-06-20 10:00:00", branch: "Thurmont Regional Library" },
    ];
    const out = fcplMapFeed(feed, NOW);
    expect(out.length).toBe(1);
    expect(out[0].event.uid).toBe("1");
  });
  it("returns [] for a non-array", () => {
    expect(fcplMapFeed(null, NOW)).toEqual([]);
  });
});
