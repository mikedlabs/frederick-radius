import { describe, it, expect } from "vitest";
import { splitLocation } from "./ical-live";

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

const NOW = new Date("2026-07-19T12:00:00Z");
const HORIZON = new Date("2026-08-18T12:00:00Z");
const FETCHED = "2026-07-19T12:00:00.000Z";

describe("official-feed classification and venue corrections", () => {
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
});

function vmRow(over: {
  title?: string;
  meta?: Record<string, unknown>;
  excerpt?: string;
  yoastImage?: string;
}): VibemapRow {
  return {
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
    expect(e.url).toBe("https://www.visitfrederick.org/event/open-mic/1/");
    expect(e.source).toBe("dfp");
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

    const socialImage =
      "https://ik.imagekit.io/vibemap/tr:w-1200,h-675,fo-auto/event.jpeg";
    const [fromYoast] = parseVibemapEvents(
      [vmRow({ meta: { vibemap_event_images: "" }, yoastImage: socialImage })],
      DFP_FEED,
      NOW,
      HORIZON,
      FETCHED,
    );
    expect(fromYoast.hero_image).toBe(socialImage);

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
