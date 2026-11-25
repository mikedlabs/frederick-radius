import { describe, it, expect } from "vitest";
import { jsonArrayFeedRowInstants, splitLocation } from "./ical-live";

describe("splitLocation venue sanity", () => {
  it("rejects a location field that is actually a description dump", () => {
    // The live Bee City subcommittee feed put its description in LOCATION.
    expect(
      splitLocation(
        "Description: Did you know Frederick City & County are Bee Cities? A Bee City brings people together.",
        "Frederick",
      ).venue,
    ).toBe("Frederick");
  });

  it("keeps real venue names (incl. abbreviations and apostrophes)", () => {
    expect(splitLocation("Carroll Creek Amphitheater, Frederick, MD", "x").venue).toBe(
      "Carroll Creek Amphitheater",
    );
    expect(splitLocation("Brewer's Alley, Frederick", "x").venue).toBe("Brewer's Alley");
    expect(splitLocation("St. John Regional Catholic Church", "x").venue).toBe(
      "St. John Regional Catholic Church",
    );
  });

  it("falls back when location is empty", () => {
    expect(splitLocation("", "Default Venue").venue).toBe("Default Venue");
    expect(splitLocation(undefined, "Default Venue").venue).toBe("Default Venue");
  });
});

// ── DFP Vibemap parser ──────────────────────────────────────────────

import {
  feedCategory,
  hasPublishedWeekdayConflict,
  LIVE_FEEDS,
  parseVibemapEvents,
  resolveKnownEventVenue,
  type FeedSpec,
  type VibemapRow,
} from "./ical-live";

const DFP_FEED: FeedSpec = {
  source: "dfp",
  source_label: "Downtown Frederick Partnership",
  url: "https://downtownfrederick.org/wp-json/wp/v2/vibemap_event",
  format: "vibemap",
  default_venue: "Downtown Frederick",
  default_geom: { lng: -77.4109, lat: 39.4137 },
  default_municipality: "frederick",
  default_category: "community",
};

const FCC_FEED: FeedSpec = {
  source: "fcc",
  source_label: "Frederick Community College",
  url: "https://api.calendar.moderncampus.net/pubcalendar/edb420ae-0d61-4c0c-90af-26e2dfad9adf/events",
  format: "moderncampus",
  default_venue: "Frederick Community College",
  default_geom: { lng: -77.4392, lat: 39.4568 },
  default_municipality: "frederick",
  default_category: "community",
};

const NOW = new Date("2026-07-19T12:00:00Z");
const HORIZON = new Date("2026-08-18T12:00:00Z");
const FETCHED = "2026-07-19T12:00:00.000Z";

describe("official-feed classification and venue corrections", () => {
  it("recognizes musical stage credits without reclassifying theater-hosted concerts", () => {
    expect(feedCategory(DFP_FEED, "Into the Woods",
      "Music and Lyrics by Stephen Sondheim Book by James Lapine Directed by Shea-Mikal Green",
    )).toBe("theater");
    expect(feedCategory(DFP_FEED, "Concert at the Weinberg Theatre",
      "Live music with the band.",
    )).toBe("music");
  });
  it("classifies tennis as sports instead of matching the phrase match play as theater", () => {
    expect(
      feedCategory(
        DFP_FEED,
        "Friday Night Lights Tennis",
        "Instruction, drills, and match play.",
      ),
    ).toBe("sports");
    expect(feedCategory(DFP_FEED, "Community Match Play", "Open to residents.")).toBe(
      "community",
    );
  });

  it("still recognizes specific theater language", () => {
    expect(
      feedCategory(
        DFP_FEED,
        "A New Frederick Story",
        "A stage play at the Weinberg Center.",
      ),
    ).toBe("theater");
  });

  it("restores the court named by the official City event page", () => {
    expect(
      resolveKnownEventVenue("city-frederick", "Friday Night Lights Tennis", {
        venue: "Frederick",
        address: "Frederick",
      }),
    ).toEqual({
      venue: "Fleming Avenue Courts",
      address: "500 Fleming Avenue, Frederick, MD 21701",
    });
  });

  // November 11, 2026 hierarchy audit: Delaplaine Arts Center's Photo Party
  // was filed under Bars because its description mentions photo trivia.
  it("keeps an arts center party out of Bars when only the description says trivia", () => {
    const delaplaine: FeedSpec = {
      ...DFP_FEED,
      source: "delaplaine",
      source_label: "Delaplaine Arts Center",
      url: "https://delaplaine.org/events/?ical=1",
      format: "ical",
      default_venue: "Delaplaine Arts Center",
      default_category: "gallery",
    };
    expect(feedCategory(delaplaine, "Photo Party",
      "Party like it's 1826 and celebrate the photographic arts! Join us for photo trivia, funky/cool/niche gear show-and-tell, print swapping, photo book oohing and a cash bar.",
    )).toBe("gallery");
    expect(feedCategory(delaplaine, "Opening Reception",
      "Beer and wine will be served.",
    )).toBe("gallery");
  });

  // Review of the Photo Party fix: making bar, brewery and winery title-only
  // also stripped Monocacy Brewing's own taproom events of "brewery", because
  // that feed's only brewery signal was the description. The feed's identity
  // is now its default category, so description evidence counts for it.
  it("keeps a brewery feed's own events under Breweries on description evidence", () => {
    const monocacyDefault = LIVE_FEEDS.find((f) => f.source === "monocacy")?.default_category;
    expect(monocacyDefault).toBe("brewery");
    const monocacy: FeedSpec = {
      ...DFP_FEED,
      source: "monocacy",
      source_label: "Monocacy Brewing",
      url: "https://monocacybrewing.com/events/?ical=1",
      format: "ical",
      default_venue: "Monocacy Brewing",
      default_category: monocacyDefault ?? "",
    };
    expect(feedCategory(monocacy, "All Hours Happy Hour",
      "Happy hour all day at Monocacy Brewing Co. $5 for every beer. The Alley Wagon food truck is here from 5 to 8.",
    )).toBe("brewery");
    expect(feedCategory(monocacy, "Trivia Night",
      "Bring a team for trivia and great beer in the taproom.",
    )).toBe("brewery");
    expect(feedCategory(monocacy, "BINGO Night!", "Prizes every round.")).toBe("brewery");
    // Earlier buckets still win, so the summer series stays live music.
    expect(feedCategory(monocacy, "Fridays at the Fountain", "Free live music on the patio.")).toBe("music");
  });

  it("counts a publisher's own CATEGORIES tag as strong evidence for a venue category", () => {
    expect(feedCategory(DFP_FEED, "Oktoberfest on the Square",
      "German food and polka downtown.", "Beer",
    )).toBe("brewery");
    expect(feedCategory(DFP_FEED, "Oktoberfest on the Square",
      "German food and polka downtown.",
    )).toBe("community");
    expect(feedCategory(DFP_FEED, "Harvest Weekend", "Live acoustic sets.", "Wine")).toBe("music");
  });

  it("does not let the Photo Party description pull an arts-center event into Bars", () => {
    expect(LIVE_FEEDS.find((f) => f.source === "delaplaine")?.default_category).toBe("gallery");
    const delaplaine: FeedSpec = {
      ...DFP_FEED,
      source: "delaplaine",
      default_venue: "Delaplaine Arts Center",
      default_category: "gallery",
    };
    expect(feedCategory(delaplaine, "Photo Party",
      "Party like it's 1826 and celebrate the photographic arts! Join us for photo trivia, funky/cool/niche gear show-and-tell, print swapping, photo book oohing and a cash bar.",
      "Photography",
    )).toBe("gallery");
  });

  it("still files a titled trivia night, pub night or tasting under its venue category", () => {
    expect(feedCategory(DFP_FEED, "Trivia Night at Olde Towne", "Teams of up to six.")).toBe("bar");
    expect(feedCategory(DFP_FEED, "Pub Crawl", "Starts downtown at 7.")).toBe("bar");
    expect(feedCategory(DFP_FEED, "Fall Beer Release", "New seasonal pours.")).toBe("brewery");
    expect(feedCategory(DFP_FEED, "Linganore Wine Weekend", "Tastings all afternoon.")).toBe("winery");
  });

  it("does not read College Park or a career fair as a park or a market", () => {
    // Production categories on Nov 9, 2026 were Parks & trails and Markets.
    expect(
      feedCategory(
        FCC_FEED,
        "On Campus Recruitment UMD, College Park Biocomputational Engineering",
        "Meet a transfer representative in the lobby.",
      ),
    ).toBe("community");
    expect(feedCategory(FCC_FEED, "Public Safety Career and College Fair", "")).toBe("community");
    expect(feedCategory(DFP_FEED, "Fall Job Fair", "Employers from across the county.")).toBe("community");
    // A real market and a real park walk keep their categories.
    expect(feedCategory(DFP_FEED, "Holiday Makers Market", "Local vendors.")).toBe("market");
    expect(feedCategory(DFP_FEED, "Baker Park Bird Walk", "Meet at the bandshell.")).toBe("outdoors");
  });

  it("classifies a campus row from its title, not from building names in the description", () => {
    // "Linganore Hall" made information sessions wineries, and the
    // "Athletics Center" made a headshot session a sports event.
    expect(
      feedCategory(FCC_FEED, "Nursing Information Session", "Linganore Hall (L Building), Room L-203."),
    ).toBe("community");
    expect(
      feedCategory(FCC_FEED, "Free Professional Headshots for FCC Students", "Athletics Center lobby."),
    ).toBe("community");
    // The title still carries a real category when it states one.
    expect(feedCategory(FCC_FEED, "FCC Chamber Ensemble Recital", "Visual & Performing Arts Center.")).toBe("music");
    expect(feedCategory(FCC_FEED, "Fall Jazz Concert", "Visual & Performing Arts Center.")).toBe("music");
    // A venue calendar keeps reading its descriptions.
    expect(feedCategory(DFP_FEED, "Friday on the Creek", "Live music with a local band.")).toBe("music");
  });

  it("reads a musical ensemble as music without reading a theater company's name as one", () => {
    const HOOD_FEED: FeedSpec = { ...FCC_FEED, source: "hood", source_label: "Hood College" };
    expect(feedCategory(HOOD_FEED, "Hood String Ensemble: “The Universal Vibe\"", "")).toBe("music");
    // Music is matched before theater, so a bare "ensemble" would have
    // filed every Maryland Ensemble Theatre listing under music.
    expect(
      feedCategory(DFP_FEED, "Death and the Girl", "Presented by Maryland Ensemble Theatre on the main stage."),
    ).not.toBe("music");
    expect(feedCategory(DFP_FEED, "Maryland Ensemble Theatre: Oh Crit!", "")).toBe("theater");
  });

  it("does not find the word art inside Partner Hours", () => {
    expect(
      feedCategory(
        DFP_FEED,
        "Partner Hours at Centro Hispano de Frederick",
        "Walk-ins welcome.",
      ),
    ).toBe("community");
  });

  it("quarantines a concrete date that conflicts with the publisher's cadence", () => {
    expect(
      hasPublishedWeekdayConflict(
        "Partner Hours at Centro Hispano de Frederick",
        "The team will be in office on third Thursdays of the month.",
        new Date("2026-08-04T20:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      hasPublishedWeekdayConflict(
        "Partner Hours at Centro Hispano de Frederick",
        "The team will be in office on third Thursdays of the month.",
        new Date("2026-08-20T20:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("does not apply an unrelated venue cadence to a one-off event", () => {
    expect(
      hasPublishedWeekdayConflict(
        "Saturday Summer Festival",
        "Join us for music and food. The visitor center is open every Tuesday.",
        new Date("2026-08-08T16:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("still catches a cadence stated directly in the event title", () => {
    expect(
      hasPublishedWeekdayConflict(
        "Community Clinic every Thursday",
        "Appointments are available.",
        new Date("2026-08-04T20:00:00.000Z"),
      ),
    ).toBe(true);
  });
});

function vmRow(over: {
  modifiedGmt?: string;
  title?: string;
  meta?: Record<string, unknown>;
  excerpt?: string;
  yoastImage?: string;
}): VibemapRow {
  return {
    modified_gmt: over.modifiedGmt,
    title: { rendered: over.title ?? "Open Mic Night" },
    link: "https://downtownfrederick.org/vm-event/open-mic/",
    excerpt: { rendered: over.excerpt ?? "" },
    meta: {
      vibemap_event_start_date: "2026-07-31 17:00:00",
      vibemap_event_end_date: "2026-07-31 19:00:00",
      vibemap_event_is_all_day: false,
      vibemap_event_is_canceled: false,
      vibemap_event_is_online: false,
      vibemap_event_url: "https://www.visitfrederick.org/event/open-mic/1/",
      vibemap_event_venue_name: "Dancing Bear Toys and Games",
      vibemap_event_venue_address: "15 N Market St, Frederick, MD 21701",
      vibemap_event_venue_latitude: 39.4141,
      vibemap_event_venue_longitude: -77.4105,
      ...over.meta,
    },
    yoast_head_json: over.yoastImage
      ? { twitter_image: over.yoastImage }
      : undefined,
  };
}

describe("parseVibemapEvents", () => {
  it("maps a real row: ET wall time, venue geo as geocoded, outbound url", () => {
    const [e] = parseVibemapEvents([vmRow({})], DFP_FEED, NOW, HORIZON, FETCHED);
    expect(e).toBeDefined();
    // 5 PM ET on Jul 31 is 21:00 UTC (EDT).
    expect(e.starts_at).toBe("2026-07-31T21:00:00.000Z");
    expect(e.venue_name).toBe("Dancing Bear Toys and Games");
    expect(e.placement).toBe("geocoded");
    expect(e.geom).toEqual({ lat: 39.4141, lng: -77.4105 });
    expect(e.url).toBe("https://downtownfrederick.org/vm-event/open-mic/");
    expect(e.source).toBe("dfp");
  });

  it("distinguishes a published two-hour session from the identical internal expiry fallback", () => {
    const [published] = parseVibemapEvents([vmRow({})], DFP_FEED, NOW, HORIZON, FETCHED);
    const [inferred] = parseVibemapEvents([vmRow({ meta: { vibemap_event_end_date: "" } })], DFP_FEED, NOW, HORIZON, FETCHED);
    expect(inferred.starts_at).toBe(published.starts_at);
    expect(inferred.ends_at).toBe(published.ends_at);
    expect(published.published_time).toBe("range");
    expect(inferred.published_time).toBe("start");
  });

  it("keeps the publisher's real modification time separate from fetch time", () => {
    const [event] = parseVibemapEvents(
      [
        vmRow({
          modifiedGmt: "2026-08-12T16:33:21",
          title: "Alive @ Five &#8211; Freddie Long",
        }),
      ],
      DFP_FEED,
      NOW,
      HORIZON,
      FETCHED,
    );

    expect(event.publisher_updated_at).toBe("2026-08-12T16:33:21.000Z");
    expect(event.last_verified_at).toBe(FETCHED);
  });

  it("retains an in-progress event until its published end", () => {
    const brunch = vmRow({
      title: "Saturday Brunch",
      meta: {
        vibemap_event_start_date: "2026-07-19 10:00:00",
        vibemap_event_end_date: "2026-07-19 12:00:00",
      },
    });
    const horizon = new Date("2026-08-18T12:00:00Z");
    expect(
      parseVibemapEvents(
        [brunch],
        DFP_FEED,
        new Date("2026-07-19T10:00:01-04:00"),
        horizon,
        FETCHED,
      ),
    ).toHaveLength(1);
    expect(
      parseVibemapEvents(
        [brunch],
        DFP_FEED,
        new Date("2026-07-19T12:00:01-04:00"),
        horizon,
        FETCHED,
      ),
    ).toHaveLength(0);
  });

  it("keeps only first-party Vibemap event art from the ImageKit account", () => {
    const image =
      "https://ik.imagekit.io/vibemap/original_images_image_event.jpeg?updatedAt=1";
    const [fromMeta] = parseVibemapEvents(
      [vmRow({ meta: { vibemap_event_images: JSON.stringify([image]) } })],
      DFP_FEED,
      NOW,
      HORIZON,
      FETCHED,
    );
    expect(fromMeta.hero_image).toBe(image);
    expect(fromMeta.hero_image_record).toBe(fromMeta.url);

    const socialImage =
      "https://ik.imagekit.io/vibemap/tr:w-1200,h-675,fo-auto/event.jpeg";
    const [fromYoast] = parseVibemapEvents(
      [vmRow({ meta: { vibemap_event_images: "" }, yoastImage: socialImage })],
      DFP_FEED,
      NOW,
      HORIZON,
      FETCHED,
    );
    expect(fromYoast.hero_image).toBeUndefined();
    expect(fromYoast.hero_image_record).toBeUndefined();

    const [wrongHost] = parseVibemapEvents(
      [vmRow({ meta: { vibemap_event_images: '["https://images.example.com/untrusted.jpg"]' } })],
      DFP_FEED,
      NOW,
      HORIZON,
      FETCHED,
    );
    expect(wrongHost.hero_image).toBeUndefined();
  });

  it("drops predicted instances that lost their clock (midnight, not all-day)", () => {
    const rows = [
      vmRow({ title: "Game Night", meta: { vibemap_event_start_date: "2026-07-21 00:00:00", vibemap_event_end_date: "2026-07-21 00:00:00" } }),
    ];
    expect(parseVibemapEvents(rows, DFP_FEED, NOW, HORIZON, FETCHED)).toHaveLength(0);
  });

  it("keeps a genuine all-day row at midnight and honors window + online + cancel flags", () => {
    const rows = [
      vmRow({ title: "Sidewalk Sale", meta: { vibemap_event_start_date: "2026-07-25 00:00:00", vibemap_event_is_all_day: true } }),
      vmRow({ title: "Out of Window", meta: { vibemap_event_start_date: "2026-10-01 17:00:00" } }),
      vmRow({ title: "Stream Thing", meta: { vibemap_event_is_online: true } }),
      vmRow({ title: "Called Off", meta: { vibemap_event_is_canceled: true } }),
    ];
    const out = parseVibemapEvents(rows, DFP_FEED, NOW, HORIZON, FETCHED);
    const titles = out.map((e) => e.title);
    expect(titles).toContain("Sidewalk Sale");
    expect(titles).not.toContain("Out of Window");
    expect(titles).not.toContain("Stream Thing");
    const cancelled = out.find((e) => e.title === "Called Off");
    expect(cancelled?.status).toBe("cancelled");
  });

  it("decodes entity-encoded titles and falls back to defaults when venue/geo are absent", () => {
    const rows = [
      vmRow({
        title: "Burger &#038; Beer Monday!",
        meta: {
          vibemap_event_venue_name: "",
          vibemap_event_venue_address: "",
          vibemap_event_venue_latitude: null,
          vibemap_event_venue_longitude: null,
          vibemap_event_url: "",
        },
      }),
    ];
    const [e] = parseVibemapEvents(rows, DFP_FEED, NOW, HORIZON, FETCHED);
    expect(e.title).toBe("Burger & Beer Monday!");
    expect(e.venue_name).toBe("Downtown Frederick");
    expect(e.placement).toBeUndefined();
    expect(e.geom).toEqual(DFP_FEED.default_geom);
    expect(e.url).toBe("https://downtownfrederick.org/vm-event/open-mic/");
  });
});

// ── Modern Campus (FCC) timezone handling ───────────────────────────

describe("jsonArrayFeedRowInstants", () => {
  const eastern = (iso: string | null) =>
    iso === null
      ? null
      : new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(iso));

  // Rows copied from the live FCC feed on Nov 9, 2026 (standard time).
  it("reads Modern Campus wall times as UTC in standard time", () => {
    const night = jsonArrayFeedRowInstants("moderncampus", {
      title: "Dual Enrollment Information Night",
      startDatetime: "2026-11-09T23:30",
      endDatetime: "2026-11-10T01:00",
    });
    expect(night.startsAtISO).toBe("2026-11-09T23:30:00.000Z");
    expect(night.rawEndsAtISO).toBe("2026-11-10T01:00:00.000Z");
    // An information night runs 6:30 to 8:00 PM, not 11:30 PM to 1:00 AM.
    expect(eastern(night.startsAtISO)).toBe("Mon 6:30 PM");
    expect(eastern(night.rawEndsAtISO)).toBe("Mon 8:00 PM");

    const recruitment = jsonArrayFeedRowInstants("moderncampus", {
      title: "On Campus Recruitment UMD, College Park Biocomputational Engineering",
      startDatetime: "2026-11-09T15:00",
      endDatetime: "2026-11-09T18:00",
    });
    // Production showed this 10 AM to 1 PM table as 3:00 PM to 6:00 PM.
    expect(eastern(recruitment.startsAtISO)).toBe("Mon 10:00 AM");
    expect(eastern(recruitment.rawEndsAtISO)).toBe("Mon 1:00 PM");
  });

  it("reads Modern Campus wall times as UTC in daylight time", () => {
    // FCC's own registration page lists College Night at 6:00 PM to 7:30 PM
    // Eastern Daylight Time.
    const collegeNight = jsonArrayFeedRowInstants("moderncampus", {
      title: "College Night",
      startDatetime: "2026-10-07T22:00",
      endDatetime: "2026-10-07T23:30",
    });
    expect(eastern(collegeNight.startsAtISO)).toBe("Wed 6:00 PM");
    expect(eastern(collegeNight.rawEndsAtISO)).toBe("Wed 7:30 PM");
  });

  it("keeps reading Presence rows from their explicit UTC fields", () => {
    const row = jsonArrayFeedRowInstants("presence", {
      eventName: "Senior Formal",
      startDateTimeUtc: "2026-11-14T00:00:00Z",
      endDateTimeUtc: "2026-11-14T03:00:00Z",
      // A Modern Campus field on a Presence row must be ignored.
      startDatetime: "2026-11-13T12:00",
    });
    expect(row.startsAtISO).toBe("2026-11-14T00:00:00.000Z");
    expect(row.rawEndsAtISO).toBe("2026-11-14T03:00:00.000Z");
  });

  it("returns null for a date-only or missing start", () => {
    // The art-gallery exhibition row carries only startDate, so it has no
    // clock time to convert and the fetcher skips it.
    const row = jsonArrayFeedRowInstants("moderncampus", { title: "Exhibition", startDate: "2026-11-07" });
    expect(row.startsAtISO).toBeNull();
    expect(row.rawEndsAtISO).toBeNull();
  });
});
