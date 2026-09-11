import { describe, it, expect } from "vitest";
import {
  localToUtcIso,
  fcplMunicipality,
  fcplCategory,
  fcplBranchLocation,
  fcplFieldString,
  fcplLocation,
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
  it("maps explicit offsite city labels into the app town system", () => {
    expect(fcplMunicipality("Walkersville, MD")).toBe("walkersville");
    expect(fcplMunicipality("Natelli YMCA, Ijamsville, MD")).toBe("urbana");
    expect(fcplMunicipality("Point of Rocks, MD")).toBe("brunswick");
  });
});

describe("fcplLocation — reviewed branches and honest offsite precedence", () => {
  it.each([
    ["C. Burr Artz Public Library", "frederick", "110 E Patrick St, Frederick, MD 21701"],
    ["Brunswick Branch Library", "brunswick", "915 N Maple Ave, Brunswick, MD 21716"],
    ["Thurmont Regional Library", "thurmont", "76 E Moser Rd, Thurmont, MD 21788"],
    ["Urbana Regional Library", "urbana", "9020 Amelung St, Frederick, MD 21704"],
    ["Myersville Community Library", "myersville", "8 Harp Pl, Myersville, MD 21773"],
    ["Emmitsburg Branch Library", "emmitsburg", "300 S Seton Ave, Emmitsburg, MD 21727"],
    ["Walkersville Branch Library", "walkersville", "2 S Glade Rd, Walkersville, MD 21793"],
    ["Middletown Branch Library", "middletown", "31 E Green St, Middletown, MD 21769"],
    [
      "Edward F. Fry Memorial Library at Point of Rocks",
      "brunswick",
      "1635 Ballenger Creek Pike, Point of Rocks, MD 21777",
    ],
  ])("maps %s to its reviewed address", (name, municipality, address) => {
    expect(fcplBranchLocation(name)).toMatchObject({
      name,
      municipality,
      address,
    });
    expect(fcplLocation({ branch: name, room: "Community Room" })).toEqual({
      rawLocation: `${name}, Community Room - ${address}`,
      municipality,
    });
  });

  it("prefers a meaningful publisher offsite address over the branch", () => {
    expect(
      fcplLocation({
        branch: { "87": "Around the Community" },
        offsite_address:
          "Walkersville Community Park\n22 Kenneth Drive\nWalkersville, MD 21793\nUnited States",
      }),
    ).toEqual({
      rawLocation:
        "Walkersville Community Park - 22 Kenneth Drive, Walkersville, MD 21793",
      municipality: "walkersville",
    });
  });

  it("decodes publisher text without changing its source provenance", () => {
    expect(
      fcplLocation({
        branch: "Around the Community",
        offsite_address:
          "Sophie and Madigan&#039;s Playground\n632 Contender Way\nFrederick, MD 21703\nUnited States",
      }),
    ).toEqual({
      rawLocation:
        "Sophie and Madigan's Playground - 632 Contender Way, Frederick, MD 21703",
      municipality: "frederick",
    });
  });

  it("does not pin an offsite event to its branch when the address is only United States", () => {
    expect(
      fcplLocation({
        branch: "C. Burr Artz Public Library",
        room: "Carroll Creek Linear Park Amphitheater",
        offsite_address: "United States",
        offsite_address_raw: [null, "US"],
      }),
    ).toEqual({
      rawLocation: "Carroll Creek Linear Park Amphitheater",
      municipality: "frederick",
    });
  });

  it("does not assign one branch address to a system-wide closure", () => {
    const branches =
      "C. Burr Artz Public Library / Brunswick Branch Library / Thurmont Regional Library";
    expect(fcplBranchLocation(branches)).toBeNull();
    expect(fcplLocation({ branch: branches })).toEqual({
      rawLocation: branches,
      municipality: "frederick",
    });
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
    image:
      "https://frederick.librarycalendar.com/sites/default/files/2026-07/storytime.jpg",
    imagealt: "Children reading together",
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
    expect(m!.event.heroImage).toBe(base.image);
    expect(m!.event.heroImageAlt).toBe(base.imagealt);
    expect(m!.event.rawLocation).toBe(
      "Brunswick Branch Library, Story Room - 915 N Maple Ave, Brunswick, MD 21716",
    );
    expect(m!.event.allDay).toBe(false);
  });

  it("keeps the official event URL and publisher image when location normalization changes", () => {
    const m = fcplMapOne(
      {
        ...base,
        branch: "Around the Community",
        room: undefined,
        offsite_address:
          "Frederick City Market\n622 N Market St\nFrederick, MD 21701\nUnited States",
      },
      NOW,
    );

    expect(m?.event).toMatchObject({
      sourceUrl: base.url,
      heroImage: base.image,
      heroImageAlt: base.imagealt,
      rawLocation:
        "Frederick City Market - 622 N Market St, Frederick, MD 21701",
    });
    expect(m?.municipality).toBe("frederick");
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

  it("drops event art outside FCPL's own public-files path", () => {
    const wrongHost = fcplMapOne(
      {
        ...base,
        image: "https://images.example.com/untrusted.jpg",
        imagealt: "<b>Untrusted</b> image",
      },
      NOW,
    );
    expect(wrongHost?.event.heroImage).toBeUndefined();
    expect(wrongHost?.event.heroImageAlt).toBeUndefined();

    const wrongPath = fcplMapOne(
      {
        ...base,
        image: "https://frederick.librarycalendar.com/user/login/avatar.jpg",
      },
      NOW,
    );
    expect(wrongPath?.event.heroImage).toBeUndefined();
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

  it("drops rows beyond the ingest horizon (the unbounded feed outgrew the run budget)", () => {
    const feed = [
      { title: "Soon", id: "1", public: true, start_date: "2026-06-20 10:00:00", branch: "Thurmont Regional Library" },
      { title: "Next season", id: "2", public: true, start_date: "2026-12-01 10:00:00", branch: "Thurmont Regional Library" },
    ];
    const out = fcplMapFeed(feed, NOW);
    expect(out.map((m) => m.event.uid)).toEqual(["1"]);
    // A wider explicit horizon still admits it — the daily cron rolls forward.
    expect(fcplMapFeed(feed, NOW, 365).length).toBe(2);
  });
});
