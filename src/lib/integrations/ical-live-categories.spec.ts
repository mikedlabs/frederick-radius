import { describe, expect, it } from "vitest";
import {
  feedCategory,
  parseVibemapEvents,
  type FeedSpec,
  type VibemapRow,
} from "./ical-live";

/**
 * 2026-10 UI audit: category mis-tags at ingest corrupted lead ranking and
 * the Interest filters. Each title below is the live row the audit named,
 * with the publisher's own excerpt text, run through the same boundary the
 * feed uses.
 */
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

const HERITAGE_FEED: FeedSpec = {
  source: "heritage-frederick",
  source_label: "Heritage Frederick",
  url: "https://frederickhistory.org/events/?ical=1",
  format: "ical",
  default_venue: "Heritage Frederick",
  default_geom: { lng: -77.4096, lat: 39.4146 },
  default_municipality: "frederick",
  default_category: "community",
};

const WEINBERG = "Weinberg Center for the Arts";

const SEDARIS_EXCERPT =
  "An Evening with Prolific Author David Sedaris David Sedaris is one of America’s pre-eminent humor writers. He is a master of satire and one of today’s most observant authors. Beloved for his personal essays and short stories, David Sedaris is the author of the New York Times bestsellers Barrel Fever, Holidays on Ice, Naked, Me Talk Pretty One Day, Dress Your Family […]";
const SARDINES_EXCERPT =
  "Tickets For special needs, group sales, or other seating questions, please contact our box office at 301-600-2828. All websales are stopped 2 hours before the performance start time.";
const FILM_EXCERPT =
  "One of the Greatest Horror Films Ever Made Don’t Look Now is a haunting psychological thriller widely regarded as one of the greatest horror films ever made.";
const PARSONS_DESCRIPTION =
  "Dr. John George will present, “Charles Carroll of Carrollton,” Frederick’s own Signer to commemorate the 250th Anniversary of the Declaration of Independence. John retired from a 47-year career in education. He is proud cofounder of the high school Academic Tournament (1982). Currently, John enjoys reading, caring for his garden, and walking in Baker Park.";
const GAME_NIGHT_EXCERPT =
  "Join us weekly and participate in a FREE poker tournament. Games start at 6:00pm and 8:00pm. Check out our large library of board games. Happy Hour Specials: $3 canned beer.";

describe("feed category inference: the audit's mis-tagged rows", () => {
  it("files David Sedaris at the Weinberg as theater, not family", () => {
    expect(
      feedCategory(DFP_FEED, "David Sedaris", SEDARIS_EXCERPT, { venue: WEINBERG }),
    ).toBe("theater");
  });

  it("files The Hot Sardines at the Weinberg as theater, not the community fallback", () => {
    expect(
      feedCategory(DFP_FEED, "The Hot Sardines", SARDINES_EXCERPT, { venue: WEINBERG }),
    ).toBe("theater");
    expect(
      feedCategory(DFP_FEED, "Centennial Event: The Hot Sardines", SARDINES_EXCERPT, {
        venue: WEINBERG,
      }),
    ).toBe("theater");
  });

  it("files a Weinberg film screening as theater, not community", () => {
    expect(
      feedCategory(
        DFP_FEED,
        "Classic Film Series: Don’t Look Now (1973)",
        FILM_EXCERPT,
        { venue: WEINBERG },
      ),
    ).toBe("theater");
    // Even without the venue, the title says it is a film.
    expect(
      feedCategory(DFP_FEED, "Classic Film Series: Don’t Look Now (1973)", FILM_EXCERPT),
    ).toBe("theater");
    expect(feedCategory(DFP_FEED, "72 Film Fest 2026 - Friday", "First Block: 6:30 PM")).toBe(
      "theater",
    );
  });

  it("files the Parsons Newman Lecture as community, not sports", () => {
    expect(
      feedCategory(
        HERITAGE_FEED,
        "Parsons Newman Lecture: Charles Carroll of Carrollton",
        PARSONS_DESCRIPTION,
        { venue: "Heritage Frederick" },
      ),
    ).toBe("community");
  });

  it("never files game, trivia, or bingo nights as sports", () => {
    expect(
      feedCategory(DFP_FEED, "Game Night", GAME_NIGHT_EXCERPT, { venue: "Frederick Social" }),
    ).toBe("community");
    expect(
      feedCategory(DFP_FEED, "Bingo Night!", "Six rounds and a poker tournament after.", {
        venue: "Monocacy Brewing Company",
      }),
    ).toBe("community");
    expect(
      feedCategory(DFP_FEED, "Trivia Night", "Weekly tournament of smarts.", {
        venue: "Monocacy Brewing Company",
      }),
    ).not.toBe("sports");
  });

  it("still lets a title or a publisher tag claim sports and family", () => {
    expect(feedCategory(DFP_FEED, "Frederick Keys vs. Hagerstown Flying Boxcars", "")).toBe(
      "sports",
    );
    expect(feedCategory(DFP_FEED, "Charity Golf Tournament", "")).toBe("sports");
    expect(feedCategory(DFP_FEED, "Family Movie Night", "")).toBe("family");
    expect(feedCategory(DFP_FEED, "Pumpkin Painting", "", { tags: "Family" })).toBe("family");
    expect(
      feedCategory(DFP_FEED, "Fridays at the Fountain", "Bring a chair.", { tags: "Music" }),
    ).toBe("music");
  });

  it("keeps child-audience prose as family evidence", () => {
    expect(feedCategory(DFP_FEED, "Story Hour in the Garden", "For children ages 3 to 5.")).toBe(
      "family",
    );
    expect(
      feedCategory(DFP_FEED, "Pumpkin Patch Morning", "Crafts for kids and a hayride."),
    ).toBe("family");
    // Audience phrases count; a book title that contains "Family" does not.
    expect(
      feedCategory(
        DFP_FEED,
        "Halloween in Downtown Frederick",
        "Bring the whole family for a fun and free Halloween celebration.",
      ),
    ).toBe("family");
    expect(
      feedCategory(DFP_FEED, "Haunted Manor", "This family-friendly production blends storytelling.", {
        venue: WEINBERG,
      }),
    ).toBe("family");
  });

  it("does not let a description's stray word outrank the title", () => {
    expect(feedCategory(DFP_FEED, "Holiday Makers Market", "Live music all day.")).toBe(
      "market",
    );
  });

  it("only fills in theater from a stage venue when nothing else matched", () => {
    expect(
      feedCategory(DFP_FEED, "Members Reception", "Light refreshments.", {
        venue: "Maryland Ensemble Theatre",
      }),
    ).toBe("theater");
    expect(
      feedCategory(DFP_FEED, "Members Reception", "Light refreshments.", {
        venue: "Frederick Social",
      }),
    ).toBe("community");
  });
});

describe("DFP Vibemap rows carry the corrected category end to end", () => {
  function row(title: string, excerpt: string, venue: string): VibemapRow {
    return {
      title: { rendered: title },
      link: "https://downtownfrederick.org/vm-event/example/",
      excerpt: { rendered: excerpt },
      meta: {
        vibemap_event_start_date: "2026-10-10 20:00:00",
        vibemap_event_end_date: "2026-10-10 22:00:00",
        vibemap_event_is_all_day: false,
        vibemap_event_is_canceled: false,
        vibemap_event_is_online: false,
        vibemap_event_venue_name: venue,
        vibemap_event_venue_address: "20 W Patrick St, Frederick, MD 21701",
        vibemap_event_venue_latitude: 39.4141261,
        vibemap_event_venue_longitude: -77.4116974,
      },
    };
  }

  it("uses the row's venue for the stage fallback", () => {
    const events = parseVibemapEvents(
      [
        row("David Sedaris", SEDARIS_EXCERPT, WEINBERG),
        row("Game Night", GAME_NIGHT_EXCERPT, "Frederick Social"),
      ],
      DFP_FEED,
      new Date("2026-10-07T12:00:00Z"),
      new Date("2026-11-06T12:00:00Z"),
      "2026-10-07T12:00:00.000Z",
    );
    expect(events.map((e) => [e.title, e.category])).toEqual([
      ["David Sedaris", "theater"],
      ["Game Night", "community"],
    ]);
  });
});
