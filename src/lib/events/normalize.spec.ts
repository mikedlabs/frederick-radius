import { describe, it, expect } from "vitest";
import {
  cleanDescription,
  cleanVenueName,
  cleanTitle,
  deshoutTitle,
  splitPresenter,
  dedupeSentences,
  clampDescription,
  isOfficialsRoster,
  seriesStem,
  recurrenceKey,
  collapseRecurringEvents,
  dedupeCrossSourceShows,
  titleIsJustVenue,
  isFacilityBooking,
  stripFacilityPrefix,
} from "./normalize";
import type { EventWithMeta } from "@/lib/loaders/events";

function mkEvent(over: Partial<EventWithMeta>): EventWithMeta {
  return {
    slug: "e",
    title: "Event",
    starts_at: "2026-06-25T22:00:00.000Z",
    venue_name: "Baker Park",
    municipality: "frederick",
    geom: { lng: -77.41, lat: 39.41 },
    geo_confidence: "area",
    ...over,
  } as unknown as EventWithMeta;
}

describe("cleanTitle sponsor strip", () => {
  it("strips a 'sponsored by …' clause up to a pipe, keeping the double bill", () => {
    expect(
      cleanTitle(
        "Summerfest Family Theatre sponsored by Pediatric Dental Center of Frederick & Smile Frederick Orthodontics | Rainbow Rock Band",
      ),
    ).toBe("Summerfest Family Theatre | Rainbow Rock Band");
  });

  it("strips a trailing 'presented by …' clause", () => {
    expect(cleanTitle("Jazz on the Creek presented by Acme Bank")).toBe("Jazz on the Creek");
  });

  it("leaves an ordinary title untouched", () => {
    expect(cleanTitle("Alive @ Five at Carroll Creek")).toBe("Alive @ Five at Carroll Creek");
  });

  it("does not mistake prose 'by' for a sponsor clause", () => {
    expect(cleanTitle("Painting by Candlelight")).toBe("Painting by Candlelight");
  });
});

describe("cleanTitle trailing when-fragment strip", () => {
  it("strips the audit's full weekday+date+time tail and de-shouts (the Rebekah Foster tile)", () => {
    expect(cleanTitle("REBEKAH FOSTER Acoustic LIVE on Stage! Thursday 7/9/26 6:30PM")).toBe(
      "Rebekah Foster Acoustic Live on Stage!",
    );
  });

  it("strips a bare trailing slash-date", () => {
    expect(cleanTitle("Downtown Farmers Market 7/12")).toBe("Downtown Farmers Market");
  });

  it("strips weekday + clock", () => {
    expect(cleanTitle("Karaoke Night Friday 8PM")).toBe("Karaoke Night");
  });

  it("strips a trailing clock and clock range (meridiem required)", () => {
    expect(cleanTitle("Vinyl Happy Hour 4-6PM")).toBe("Vinyl Happy Hour");
    expect(cleanTitle("Acoustic Set at 6:30 p.m.")).toBe("Acoustic Set");
  });

  it("never strips a bare weekday (Taco Tuesday survives)", () => {
    expect(cleanTitle("Taco Tuesday")).toBe("Taco Tuesday");
    expect(cleanTitle("Freaky Friday Screening")).toBe("Freaky Friday Screening");
  });

  it("never strips a meridiem-less number", () => {
    expect(cleanTitle("9 to 5")).toBe("9 to 5");
    expect(cleanTitle("Route 66 Cruise Night")).toBe("Route 66 Cruise Night");
  });

  it("refuses a strip that would leave no title behind", () => {
    expect(cleanTitle("7/9 6:30PM")).toBe("7/9 6:30PM");
  });
});

describe("deshoutTitle", () => {
  it("title-cases a wholly shouted title, lowering small words", () => {
    expect(deshoutTitle("NIGHT OF THE STARS")).toBe("Night of the Stars");
    expect(deshoutTitle("SUMMER CONCERT SERIES")).toBe("Summer Concert Series");
  });

  it("calms only substantial shouted words in a mixed title", () => {
    expect(deshoutTitle("REBEKAH FOSTER Acoustic LIVE on Stage!")).toBe(
      "Rebekah Foster Acoustic Live on Stage!",
    );
  });

  it("keeps vowel-less and allowlisted acronyms shouted", () => {
    expect(deshoutTitle("DJ Night with FCPS Families")).toBe("DJ Night with FCPS Families");
    expect(deshoutTitle("AYCE Crab Feast")).toBe("AYCE Crab Feast");
    expect(deshoutTitle("YMCA FAMILY SWIM")).toBe("YMCA Family Swim");
  });

  it("leaves an ordinary sensible-case title untouched", () => {
    expect(deshoutTitle("Alive @ Five at Carroll Creek")).toBe(
      "Alive @ Five at Carroll Creek",
    );
  });
});

describe("splitPresenter", () => {
  it("splits a normal 'Organization - Event' title", () => {
    expect(splitPresenter("Frederick Arts Council - Annual Members Show")).toEqual({
      presenter: "Frederick Arts Council",
      title: "Annual Members Show",
    });
  });

  it("refuses a cut inside a parenthesized span (the shipped '18)' title)", () => {
    // A hyphen inside "(June 17-18)" is a date range, not a presenter
    // separator — splitting there published the event titled "18) …".
    expect(splitPresenter("Frederick Arts Council Show (June 17-18) Downtown")).toEqual({
      title: "Frederick Arts Council Show (June 17-18) Downtown",
    });
  });

  it("refuses a cut whose right side starts with a digit", () => {
    expect(splitPresenter("Lions Club Festival June 17-19 Fireworks")).toEqual({
      title: "Lions Club Festival June 17-19 Fireworks",
    });
  });
});

describe("dedupeSentences", () => {
  it("drops an exactly repeated paragraph (the techfrederick case)", () => {
    const para =
      "Join area leaders for a candid conversation about growing a tech business in Frederick.";
    expect(dedupeSentences(`${para} ${para} ${para}`)).toBe(para);
  });

  it("keeps distinct sentences in order", () => {
    const s = "First point here. Second point follows. Third closes it out.";
    expect(dedupeSentences(s)).toBe(s);
  });

  it("lets short interjections repeat", () => {
    const s = "Join us! Live music all night. Join us!";
    expect(dedupeSentences(s)).toBe(s);
  });
});

describe("clampDescription", () => {
  it("returns short text untouched", () => {
    expect(clampDescription("A night market on Carroll Creek.", 320)).toBe(
      "A night market on Carroll Creek.",
    );
  });

  it("cuts at a sentence boundary, never mid-clause", () => {
    const first = "Sentence one runs about here and ends cleanly.";
    const out = clampDescription(`${first} ${"x".repeat(400)}`, 320);
    expect(out).toBe(first);
  });

  it("falls back to a word-boundary cut + ellipsis when no sentence fits", () => {
    const out = clampDescription(`${"word ".repeat(100)}end`, 100);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
  });

  it("is idempotent", () => {
    const once = clampDescription("alpha beta. ".repeat(60), 300);
    expect(clampDescription(once, 300)).toBe(once);
  });
});

describe("cleanVenueName", () => {
  it("nulls a description/metadata dump leaked into the venue", () => {
    expect(
      cleanVenueName("Description: Did you know Frederick City & County are Bee Cities?"),
    ).toBeNull();
    expect(cleanVenueName("Event Time: 7 PM")).toBeNull();
  });

  it("keeps real venue names", () => {
    expect(cleanVenueName("Carroll Creek Amphitheater")).toBe("Carroll Creek Amphitheater");
    expect(cleanVenueName("Brewer's Alley")).toBe("Brewer's Alley");
  });

  it("nulls empty / missing", () => {
    expect(cleanVenueName("")).toBeNull();
    expect(cleanVenueName(null)).toBeNull();
    expect(cleanVenueName(undefined)).toBeNull();
  });

  it("nulls degenerate state/county tokens (the 'at MD' / 'at .' audit copy)", () => {
    expect(cleanVenueName("MD")).toBeNull();
    expect(cleanVenueName("Maryland")).toBeNull();
    expect(cleanVenueName("Frederick County")).toBeNull();
    expect(cleanVenueName("Frederick County, MD")).toBeNull();
  });

  it("nulls sub-3-char scraps after trimming", () => {
    expect(cleanVenueName("  a ")).toBeNull();
    expect(cleanVenueName("--")).toBeNull();
  });

  it("keeps real names that merely contain the county", () => {
    expect(cleanVenueName("Frederick County Fairgrounds")).toBe(
      "Frederick County Fairgrounds",
    );
  });

  it("restores the official capitalization of Frederick Fairgrounds", () => {
    expect(cleanVenueName("frederick Fairgrounds")).toBe("Frederick Fairgrounds");
  });
});

describe("cleanDescription", () => {
  it("strips a full metadata-dump block to empty", () => {
    expect(
      cleanDescription("Event date: June 9, 2026 Event Time: 6:00 PM Location: City Hall"),
    ).toBe("");
    expect(cleanDescription("Date: Jun 9 Time: 6 PM")).toBe("");
  });

  it("strips a leading metadata block but keeps the prose after it", () => {
    expect(
      cleanDescription(
        "Event date: June 9 Event Time: 6 PM Come enjoy live music at the park!",
      ),
      // The chain (date→time) is removed; the final "Event Time:" segment is
      // kept rather than risk eating the prose — prose is never lost.
    ).toBe("Event Time: 6 PM Come enjoy live music at the park!");
  });

  it("strips a 'Event Time: … Description: <prose>' dump to just the prose", () => {
    // The exact shape the live County feed leaked onto prod.
    expect(
      cleanDescription(
        "Event Time: 07:00 PM - 11:59 PM Description: The Agriculture Business Council was formed to invest in local farms.",
      ),
    ).toBe("The Agriculture Business Council was formed to invest in local farms.");
  });

  it("drops a bare 'Description:' prefix, keeping the prose", () => {
    expect(cleanDescription("Description: A night market on Carroll Creek.")).toBe(
      "A night market on Carroll Creek.",
    );
  });

  it("leaves ordinary prose untouched", () => {
    const prose = "Join us for a wine tasting at the vineyard with live jazz.";
    expect(cleanDescription(prose)).toBe(prose);
  });

  it("never eats a standalone one-line description that starts with a label word", () => {
    // No chain → the lone-label drop must NOT fire.
    expect(cleanDescription("Time: A Musical Journey Through the Decades")).toBe(
      "Time: A Musical Journey Through the Decades",
    );
  });

  it("preserves prose that merely contains a colon", () => {
    const s = "Our promise: a great night out for the whole family.";
    expect(cleanDescription(s)).toBe(s);
  });

  it("decodes entities and collapses whitespace (via cleanFeedText)", () => {
    expect(cleanDescription("Live   music &amp;  dancing")).toBe("Live music & dancing");
  });

  it("handles null/undefined/empty", () => {
    expect(cleanDescription(null)).toBe("");
    expect(cleanDescription(undefined)).toBe("");
    expect(cleanDescription("")).toBe("");
  });

  it("is idempotent", () => {
    const once = cleanDescription("Event date: Jun 9 Time: 6 PM Location: Carroll Creek");
    expect(cleanDescription(once)).toBe(once);
  });
});

describe("isOfficialsRoster + cleanDescription roster handling", () => {
  it("drops the county calendar officials roster (2026-06 audit, blocker 3)", () => {
    const roster =
      "Council Vice President Kavonte Duckett, Council Member Jerry Donald, Council Member Renee Knapp, Council Member M.C. Keegan-Ayer";
    expect(isOfficialsRoster(roster)).toBe(true);
    expect(cleanDescription(roster)).toBe("");
  });

  it("keeps real prose that mentions officials", () => {
    const prose =
      "Mayor O'Connor will speak at noon. The celebration includes live music, food vendors, and a kids zone.";
    expect(isOfficialsRoster(prose)).toBe(false);
    expect(cleanDescription(prose)).toContain("live music");
  });

  it("keeps short comma lists that are not rosters", () => {
    expect(isOfficialsRoster("Live music, food vendors, kids zone, face painting")).toBe(false);
  });

  it("keeps a two-name roster fragment (under the 3-segment floor)", () => {
    expect(isOfficialsRoster("Mayor Smith, Council Member Jones")).toBe(false);
  });
});

describe("seriesStem + series collapse", () => {
  it("returns the part before ' | ' when the stem is substantial", () => {
    expect(seriesStem("Summer Concert Series | Radio King Orchestra (Swing)")).toBe(
      "Summer Concert Series",
    );
  });

  it("leaves a pipeless title untouched", () => {
    expect(seriesStem("Father's Day Walking Tour")).toBe("Father's Day Walking Tour");
  });

  it("does not strip a too-short generic prefix (avoids merging unrelated events)", () => {
    expect(seriesStem("Show | The Band")).toBe("Show | The Band");
  });

  it("keys every act of a series to the same recurrence bucket", () => {
    const a = recurrenceKey({ title: "Summer Concert Series | K Street Union", venue: "Baker Park", municipality: "frederick" });
    const b = recurrenceKey({ title: "Summer Concert Series | Radio King Orchestra", venue: "Baker Park", municipality: "frederick" });
    expect(a).toBe(b);
  });

  it("collapses a scattered 'Series | Act' run into one card titled by the series", () => {
    const acts = ["BIRCKHEAD (Jazz)", "The JoGo Project", "K Street Union", "Radio King Orchestra"];
    const events = acts.map((act, i) =>
      mkEvent({ slug: `scs-${i}`, title: `Summer Concert Series | ${act}`, starts_at: `2026-06-${25 + i}T22:00:00.000Z` }),
    );
    const out = collapseRecurringEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Summer Concert Series");
    expect(out[0].is_recurring).toBe(true);
    expect(out[0].recurrence_text).toBe("4 upcoming dates");
  });

  it("does not merge the same series stem across different venues", () => {
    const out = collapseRecurringEvents([
      mkEvent({ slug: "x1", title: "Trivia Night | Round 1", venue_name: "The Pour House" }),
      mkEvent({ slug: "x2", title: "Trivia Night | Round 1", venue_name: "Olde Mother Brewing" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("dedupeCrossSourceShows", () => {
  // The audit's pair: one source titles the show with the schedule embedded
  // and knows the venue + real time; the other emits a bare noon row.
  const venued = mkEvent({
    slug: "rebekah-foster-acoustic-live-on-stage",
    title: "Rebekah Foster Acoustic Live on Stage!",
    venue_name: "Rockwell Brewery",
    starts_at: "2026-07-09T22:30:00.000Z", // 6:30 PM ET
  });
  const bareNoon = mkEvent({
    slug: "rebekah-foster-acoustic-live",
    title: "Rebekah Foster Acoustic Live",
    venue_name: null as unknown as string,
    starts_at: "2026-07-09T16:00:00.000Z", // the feeds' default 12:00 PM ET
  });

  it("collapses a same-day cross-source pair, keeping the venued real-time row", () => {
    // Input arrives time-sorted, so the bare noon row comes FIRST and must
    // still lose to the later, better-documented row.
    const out = dedupeCrossSourceShows([bareNoon, venued]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("rebekah-foster-acoustic-live-on-stage");
    expect(out[0].venue_name).toBe("Rockwell Brewery");
  });

  it("does not merge the same show title on different days", () => {
    const nextWeek = { ...bareNoon, slug: "rf-2", starts_at: "2026-07-16T16:00:00.000Z" };
    expect(dedupeCrossSourceShows([venued, nextWeek])).toHaveLength(2);
  });

  it("does not merge when both rows state different venues", () => {
    const elsewhere = {
      ...bareNoon,
      slug: "rf-3",
      venue_name: "Olde Mother Brewing",
      starts_at: "2026-07-09T20:00:00.000Z",
    };
    expect(dedupeCrossSourceShows([venued, elsewhere])).toHaveLength(2);
  });

  it("never merges on a short generic stem", () => {
    const a = mkEvent({ slug: "lm-1", title: "Live Music", venue_name: "The Pour House" });
    const b = mkEvent({
      slug: "lm-2",
      title: "Live Music",
      venue_name: null as unknown as string,
    });
    expect(dedupeCrossSourceShows([a, b])).toHaveLength(2);
  });

  it("skips collapsed recurring series cards", () => {
    const series = mkEvent({
      slug: "rf-series",
      title: "Rebekah Foster Acoustic Live",
      is_recurring: true,
      venue_name: null as unknown as string,
      starts_at: "2026-07-09T16:00:00.000Z",
    });
    expect(dedupeCrossSourceShows([series, venued])).toHaveLength(2);
  });

  it("keeps the first row on a documentation tie", () => {
    const twinA = { ...bareNoon, slug: "twin-a" };
    // Midnight ET is the other "we don't actually know" default, so both
    // rows score 0 and the earlier row must win.
    const twinB = { ...bareNoon, slug: "twin-b", starts_at: "2026-07-09T04:00:00.000Z" };
    const out = dedupeCrossSourceShows([twinA, twinB]);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("twin-a");
  });
});

describe("cleanTitle — trailing genre-tag pipe suffix", () => {
  it("strips an appended category tag but never a real double bill", () => {
    expect(cleanTitle("Fridays at the Fountain | Live Music")).toBe("Fridays at the Fountain");
    expect(cleanTitle("Thursday Nights | Trivia")).toBe("Thursday Nights");
    expect(cleanTitle("Open Stage | Karaoke")).toBe("Open Stage");
    // A named second act is content, not a tag.
    expect(cleanTitle("Summerfest | Rainbow Rock Band")).toBe("Summerfest | Rainbow Rock Band");
  });
});

describe("titleIsJustVenue", () => {
  it("drops the venue-name-as-title lineup placeholder", () => {
    expect(titleIsJustVenue("JoJo's Restaurant & Tap House", "JoJo's Restaurant & Tap House")).toBe(true);
    // A shortened form of the venue name still says nothing new.
    expect(titleIsJustVenue("JoJo's", "JoJo's Restaurant & Tap House")).toBe(true);
    // Punctuation/case variance doesn't rescue it.
    expect(titleIsJustVenue("Jojos Restaurant and Tap House", "JoJo's Restaurant & Tap House")).toBe(false);
  });

  it("keeps titles that carry any information of their own", () => {
    expect(titleIsJustVenue("Freddie Long at Monocacy Crossing", "Monocacy Crossing")).toBe(false);
    expect(titleIsJustVenue("Live music at JoJo's", "JoJo's Restaurant & Tap House")).toBe(false);
    expect(titleIsJustVenue("JoJo's Summer Bash", "JoJo's Restaurant & Tap House")).toBe(false);
  });

  it("never fires without a venue or without a title", () => {
    expect(titleIsJustVenue("JoJo's Restaurant & Tap House", null)).toBe(false);
    expect(titleIsJustVenue("JoJo's Restaurant & Tap House", "")).toBe(false);
    expect(titleIsJustVenue("", "JoJo's Restaurant & Tap House")).toBe(false);
  });
});

describe("isFacilityBooking", () => {
  it("drops pavilion rentals, private bookings, and program blocks", () => {
    for (const t of [
      "East End Park Pavilion - B.S. Rental",
      "Large Pavilion A - Wachter Celebration of Life",
      "Large Pavilion B - Rocky Ridge 4-H Club",
      "Small Pavilion - TOT - Summer Park Program",
      "Large Pavilion A - Thurmont Church of the Brethren Sunday Service",
    ]) {
      expect(isFacilityBooking(t)).toBe(true);
    }
  });

  it("keeps a public draw hosted at a facility", () => {
    expect(isFacilityBooking("Large Pavilion A - Main Street Farmers Market")).toBe(false);
    expect(isFacilityBooking("Baker Park Bandshell - Summer Concert Series")).toBe(false);
  });

  it("never fires on ordinary hyphenated titles", () => {
    expect(isFacilityBooking("Frederick Arts Council - Annual Members Show")).toBe(false);
    expect(isFacilityBooking("Alive @ Five at Carroll Creek")).toBe(false);
  });
});

describe("stripFacilityPrefix", () => {
  it("strips the ledger prefix from a kept public event", () => {
    expect(stripFacilityPrefix("Large Pavilion A - Main Street Farmers Market")).toBe(
      "Main Street Farmers Market",
    );
  });

  it("is identity for ordinary titles and presenter splits", () => {
    expect(stripFacilityPrefix("Frederick Arts Council - Annual Members Show")).toBe(
      "Frederick Arts Council - Annual Members Show",
    );
    expect(stripFacilityPrefix("Alive @ Five at Carroll Creek")).toBe(
      "Alive @ Five at Carroll Creek",
    );
  });

  it("refuses a strip that would leave a scrap behind", () => {
    expect(stripFacilityPrefix("Large Pavilion A - B.S.")).toBe("Large Pavilion A - B.S.");
  });
});
