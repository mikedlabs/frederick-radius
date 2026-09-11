import { describe, expect, it } from "vitest";
import { clockLine, timeAnchorOf, eventContextLines, eventHasCredibleLocation, concisePlainTextAnswer, normalizePlainTextAnswer, optionCountInstruction, rankForSources, requestedOptionCount, filterCitedSources, scopeAskEvents, scopeAskEventsByProximity, stripInlineMarkdown, wantsAirQuality, wantsParking, wantsWeather, wantsWeatherAnswer, wantIntentOf, type AskEvent } from "./context";

// A fixed summer Wednesday, 6 PM Eastern (22:00 UTC in July / EDT).
const WED_6PM = new Date("2026-07-15T18:00:00-04:00");

function ev(over: Partial<AskEvent>): AskEvent {
  return {
    slug: "e",
    title: "Event",
    starts_at: "2026-07-15T19:00:00-04:00",
    ends_at: "2026-07-15T21:00:00-04:00",
    placement: "venue",
    geo_confidence: "venue_match",
    ...over,
  };
}

describe("clockLine", () => {
  it("prints the Eastern date at HOUR granularity (it is the cache key)", () => {
    expect(clockLine(WED_6PM)).toBe("Wednesday, July 15, 2026, 6 PM");
    // Same hour, different minute → identical line (cache-stable).
    expect(clockLine(new Date("2026-07-15T18:59:00-04:00"))).toBe("Wednesday, July 15, 2026, 6 PM");
  });
});

describe("timeAnchorOf", () => {
  it("hears tonight/this evening as the evening window", () => {
    expect(timeAnchorOf("Music tonight")).toBe("tonight");
    expect(timeAnchorOf("anything this evening?")).toBe("tonight");
  });
  it("hears today/now as the whole day", () => {
    expect(timeAnchorOf("what's happening today")).toBe("today");
    expect(timeAnchorOf("anything going on right now?")).toBe("today");
  });
  it("most-specific wins: tomorrow and weekend beat tonight", () => {
    expect(timeAnchorOf("live music tomorrow night")).toBe("tomorrow");
    expect(timeAnchorOf("what should we do this weekend")).toBe("weekend");
  });
  it("timeless questions get no anchor", () => {
    expect(timeAnchorOf("best coffee in Frederick")).toBeNull();
  });
});

describe("eventContextLines", () => {
  it("a tonight event lands in the TODAY block with its clock time, venue, town, and category", () => {
    const { block, picked } = eventContextLines(
      [ev({ slug: "jam", title: "Bluegrass Jam", venue_name: "Steinhardt Brewing", municipality_name: "Frederick", category: "music" })],
      "today",
      WED_6PM,
    );
    expect(block).toContain("EVENTS TODAY (including tonight)");
    expect(block).toContain("7:00 PM: Bluegrass Jam at Steinhardt Brewing (Frederick) [live music]");
    expect(picked.map((e) => e.slug)).toEqual(["jam"]);
  });

  it("tomorrow's window excludes tonight and next week", () => {
    const pool = [
      ev({ slug: "tonight" }),
      ev({ slug: "tmrw", starts_at: "2026-07-16T19:00:00-04:00", ends_at: "2026-07-16T21:00:00-04:00" }),
      ev({ slug: "next-week", starts_at: "2026-07-22T19:00:00-04:00", ends_at: "2026-07-22T21:00:00-04:00" }),
    ];
    const { picked } = eventContextLines(pool, "tomorrow", WED_6PM);
    expect(picked.map((e) => e.slug)).toEqual(["tmrw"]);
  });

  it("ranks a major draw ahead of a small earlier listing when asked for the biggest event", () => {
    const pool = [
      ev({
        slug: "early-small",
        title: "Taproom Trivia",
        starts_at: "2026-07-16T17:00:00-04:00",
        ends_at: "2026-07-16T18:00:00-04:00",
        category: "food-drink",
      }),
      ev({
        slug: "alive-at-five",
        title: "Alive at Five",
        starts_at: "2026-07-16T17:00:00-04:00",
        ends_at: "2026-07-16T20:00:00-04:00",
        category: "music",
        ticket_url: "https://example.com/tickets",
      }),
    ];

    const { picked } = eventContextLines(
      pool,
      "tomorrow",
      WED_6PM,
      "What is the biggest event tomorrow?",
      1,
    );
    expect(picked.map((event) => event.slug)).toEqual(["alive-at-five"]);
  });

  it("tonight keeps the 7 PM show even when afternoon programs would eat the cap (the prod miss)", () => {
    const afternoon = Array.from({ length: 12 }, (_, i) =>
      ev({ slug: `pm${i}`, title: `Program ${i}`, starts_at: "2026-07-15T13:45:00-04:00", ends_at: "2026-07-15T14:45:00-04:00" }),
    );
    const jam = ev({ slug: "jam", title: "Bluegrass Jam", category: "music", starts_at: "2026-07-15T19:00:00-04:00", ends_at: "2026-07-15T21:00:00-04:00" });
    const noon = new Date("2026-07-15T12:00:00-04:00");
    const { block, picked } = eventContextLines([...afternoon, jam], "tonight", noon);
    expect(block).toContain("EVENTS TONIGHT");
    expect(picked.map((e) => e.slug)).toEqual(["jam"]);
  });

  it("a live show that started mid-afternoon survives the tonight hour gate", () => {
    const six = new Date("2026-07-15T18:00:00-04:00");
    const running = ev({ slug: "freddie", title: "Freddie Long at Pistarro's", category: "music", starts_at: "2026-07-15T15:00:00-04:00", ends_at: "2026-07-15T22:00:00-04:00" });
    const { picked } = eventContextLines([running], "tonight", six);
    expect(picked.map((e) => e.slug)).toEqual(["freddie"]);
  });

  it("does not let daytime or day-length rows crowd out a real tonight event", () => {
    const afternoon = new Date("2026-08-13T14:20:00-04:00");
    const aliveAtFive = ev({
      slug: "alive-at-five",
      title: "Alive at Five",
      category: "music",
      ticket_url: "https://example.com/alive",
      starts_at: "2026-08-13T17:00:00-04:00",
      ends_at: "2026-08-13T20:00:00-04:00",
    });
    const endingAtThree = ev({
      slug: "game-time",
      title: "Game Time",
      starts_at: "2026-08-13T10:00:00-04:00",
      ends_at: "2026-08-13T15:00:00-04:00",
    });
    const suspiciousDaylong = ev({
      slug: "summerfest-family-theatre",
      title: "Summerfest Family Theatre",
      starts_at: "2026-08-13T10:00:00-04:00",
      ends_at: "2026-08-13T22:45:00-04:00",
    });

    const { picked } = eventContextLines(
      [endingAtThree, suspiciousDaylong, aliveAtFive],
      "tonight",
      afternoon,
      "What should I do tonight near downtown Frederick?",
    );

    expect(picked.map((event) => event.slug)).toEqual(["alive-at-five"]);
  });

  it("does not claim an in-progress range listing occurs tonight without a dated occurrence", () => {
    const six = new Date("2026-07-15T18:00:00-04:00");
    const residency = ev({
      slug: "freddie-range",
      title: "Freddie Long at Pistarro's",
      category: "music",
      starts_at: "2026-07-15T12:00:00-04:00",
      ends_at: "2026-08-19T23:59:59-04:00",
    });
    const { block, picked } = eventContextLines([residency], "tonight", six);
    expect(picked).toEqual([]);
    expect(block).toContain("(no listed events in this window)");
  });

  it("tomorrow night keeps dated evening events and excludes daytime and range-only rows", () => {
    const pool = [
      ev({
        slug: "morning",
        starts_at: "2026-07-16T10:00:00-04:00",
        ends_at: "2026-07-16T11:00:00-04:00",
      }),
      ev({
        slug: "evening",
        starts_at: "2026-07-16T19:00:00-04:00",
        ends_at: "2026-07-16T21:00:00-04:00",
      }),
      ev({
        slug: "range-only",
        starts_at: "2025-07-03T12:00:00-04:00",
        ends_at: "2027-01-01T00:00:00-05:00",
      }),
    ];
    const { picked } = eventContextLines(pool, "tomorrow", WED_6PM, "Anything fun tomorrow night");
    expect(picked.map((e) => e.slug)).toEqual(["evening"]);
  });

  it("an empty window says so explicitly instead of omitting the block", () => {
    const { block, picked } = eventContextLines([], "today", WED_6PM);
    expect(block).toContain("(no listed events in this window)");
    expect(picked).toEqual([]);
  });

  it("caps the block", () => {
    const pool = Array.from({ length: 24 }, (_, i) => ev({ slug: `e${i}`, title: `Show ${i}` }));
    expect(eventContextLines(pool, "today", WED_6PM).picked).toHaveLength(16);
  });

  it("query-relevant rows survive the cap (the second prod miss: 7 PM music past 16 earlier rows)", () => {
    const noon = new Date("2026-07-15T12:00:00-04:00");
    const early = Array.from({ length: 18 }, (_, i) =>
      ev({ slug: `k${i}`, title: `Karaoke ${i}`, starts_at: "2026-07-15T17:00:00-04:00", ends_at: "2026-07-15T18:00:00-04:00" }),
    );
    const jam = ev({ slug: "jam", title: "Bluegrass Jam", category: "music", starts_at: "2026-07-15T19:00:00-04:00", ends_at: "2026-07-15T21:00:00-04:00" });
    const { picked } = eventContextLines([...early, jam], "tonight", noon, "Music tonight");
    expect(picked.some((e) => e.slug === "jam")).toBe(true);
    // ...and the block stays chronological after the relevance cut.
    expect(picked[picked.length - 1].slug).toBe("jam");
  });
});

describe("scopeAskEvents", () => {
  it("keeps a selected town's event context inside that town", () => {
    const pool = [
      ev({ slug: "urbana", municipality: "urbana" }),
      ev({ slug: "frederick", municipality: "frederick" }),
    ];
    expect(scopeAskEvents(pool, "urbana").map((event) => event.slug)).toEqual(["urbana"]);
  });

  it("keeps near-me and walking event windows close to the precise origin", () => {
    const downtown = { lng: -77.4105, lat: 39.4143 };
    const pool = [
      ev({ slug: "downtown", geom: { lng: -77.4098, lat: 39.4139 } }),
      ev({ slug: "edge-of-walk", geom: { lng: -77.431, lat: 39.4143 } }),
      ev({ slug: "mount-airy", geom: { lng: -77.1547, lat: 39.3762 } }),
    ];

    expect(
      scopeAskEventsByProximity(pool, "Anything fun tonight near me?", downtown)
        .map((event) => event.slug),
    ).toEqual(["downtown", "edge-of-walk"]);
    expect(
      scopeAskEventsByProximity(pool, "What is within walking distance tonight?", downtown)
        .map((event) => event.slug),
    ).toEqual(["downtown", "edge-of-walk"]);
  });

  it("does not claim proximity from an approximate town centroid", () => {
    const pool = [
      ev({ slug: "frederick", geom: { lng: -77.4105, lat: 39.4143 } }),
      ev({ slug: "mount-airy", geom: { lng: -77.1547, lat: 39.3762 } }),
    ];
    expect(
      scopeAskEventsByProximity(
        pool,
        "Anything fun tonight near me?",
        { lng: -77.4105, lat: 39.4143 },
        false,
      ).map((event) => event.slug),
    ).toEqual(["frederick", "mount-airy"]);
  });
});

describe("eventHasCredibleLocation", () => {
  it("withholds a feed/town fallback centroid", () => {
    expect(eventHasCredibleLocation(ev({
      municipality: "frederick",
      municipality_name: "Frederick",
      geom: { lng: -77.4109, lat: 39.4143 },
      placement: "geocoded",
      geo_confidence: "area",
    }))).toBe(false);
  });

  it("accepts a loader-resolved venue at the edge of a town", () => {
    expect(eventHasCredibleLocation(ev({
      municipality: "thurmont",
      municipality_name: "Thurmont",
      geom: { lng: -77.4612, lat: 39.6217 },
      placement: "venue",
      geo_confidence: "venue_match",
    }))).toBe(true);
  });
});

describe("nearest event ranking", () => {
  it("preserves precise proximity ahead of editorial prominence", () => {
    const near = ev({
      slug: "near-program",
      title: "Nearby Program",
      distance_m: 120,
    });
    const farMarquee = ev({
      slug: "far-marquee",
      title: "Major Ticketed Concert",
      category: "music",
      ticket_url: "https://example.com/tickets",
      distance_m: 1_900,
    });

    expect(
      rankForSources(
        [farMarquee, near],
        "What is the nearest event tonight?",
      ).map((event) => event.slug),
    ).toEqual(["near-program", "far-marquee"]);
  });
});

describe("rankForSources", () => {
  it("'bands playing in frederick today' finds the music category past 16 morning rows (the prod miss)", () => {
    const noon = new Date("2026-07-15T09:00:00-04:00");
    const morning = Array.from({ length: 16 }, (_, i) =>
      ev({ slug: `m${i}`, title: `Senior Yoga ${i}`, category: "wellness", venue_name: "Frederick Parks & Rec", starts_at: "2026-07-15T10:00:00-04:00", ends_at: "2026-07-15T11:00:00-04:00" }),
    );
    const jam = ev({ slug: "jam", title: "Bluegrass Jam", category: "music", starts_at: "2026-07-15T19:00:00-04:00", ends_at: "2026-07-15T21:00:00-04:00" });
    const { picked } = eventContextLines([...morning, jam], "today", noon, "are there any bands playing in frederick today");
    expect(picked.some((e) => e.slug === "jam")).toBe(true);
  });

  it("'Music tonight' leads with the music event, not the earlier tai chi", () => {
    const picked = [
      ev({ slug: "tai-chi", title: "Tai Chi with Cain", category: "wellness" }),
      ev({ slug: "market", title: "Farmers Market", category: "market" }),
      ev({ slug: "jam", title: "Bluegrass Jam", category: "music" }),
    ];
    expect(rankForSources(picked, "Music tonight")[0].slug).toBe("jam");
  });
  it("no meaningful tokens → chronological order untouched", () => {
    const picked = [ev({ slug: "a" }), ev({ slug: "b" })];
    expect(rankForSources(picked, "now?").map((e) => e.slug)).toEqual(["a", "b"]);
  });
});

describe("wantsParking / wantsWeather", () => {
  it("parking questions trip it; green-space 'parks' never does", () => {
    expect(wantsParking("where can I park downtown")).toBe(true);
    expect(wantsParking("any parking garages near the creek")).toBe(true);
    expect(wantsParking("do the meters run on saturday")).toBe(true);
    expect(wantsParking("best parks for kids")).toBe(false);
    expect(wantsParking("dog park near me")).toBe(false);
  });
  it("weather questions trip it; ordinary plans don't", () => {
    expect(wantsWeather("will it rain this weekend")).toBe(true);
    expect(wantsWeather("what's the forecast tomorrow")).toBe(true);
    expect(wantsWeather("is it going to be sunny")).toBe(true);
    expect(wantsWeather("what is the air quality")).toBe(true);
    expect(wantsAirQuality("what is the AQI")).toBe(true);
    expect(wantsWeather("what should we do this weekend")).toBe(false);
  });

  it("does not replace a weather-aware activity request with a forecast-only answer", () => {
    expect(wantsWeatherAnswer("What is the air quality?")).toBe(true);
    expect(wantsWeatherAnswer("Is the air quality safe for kids?")).toBe(true);
    expect(wantsWeatherAnswer("Will it rain tomorrow?")).toBe(true);
    expect(
      wantsWeatherAnswer("Something indoors with kids because it is raining"),
    ).toBe(false);
  });
});

describe("wantIntentOf", () => {
  it("'good breakfast spot downtown' routes to the breakfast machinery, scoped downtown (the prod miss)", () => {
    expect(wantIntentOf("good breakfast spot downtown", WED_6PM)).toEqual({
      key: "breakfast",
      cuisine: null,
      area: { kind: "downtown" },
    });
  });
  it("a named cuisine is a food ask; a meal word scopes it", () => {
    expect(wantIntentOf("any good thai food?", WED_6PM)).toEqual({ key: "food", cuisine: "thai", area: null });
    expect(wantIntentOf("tacos for dinner", WED_6PM)).toEqual({ key: "dinner", cuisine: "mexican", area: null });
  });
  it("treats a numbered date-night restaurant request as dinner discovery", () => {
    expect(wantIntentOf("three date-night restaurants downtown", WED_6PM)).toEqual({
      key: "dinner",
      cuisine: null,
      area: { kind: "downtown" },
    });
  });
  it("craving nouns resolve; town qualifiers scope them", () => {
    expect(wantIntentOf("coffee in brunswick", WED_6PM)).toEqual({
      key: "coffee",
      cuisine: null,
      area: { kind: "town", slug: "brunswick" },
    });
    expect(wantIntentOf("ice cream in mt airy", WED_6PM)).toEqual({
      key: "ice-cream",
      cuisine: null,
      area: { kind: "town", slug: "mount-airy" },
    });
  });
  it("'where should we eat' hears the meal it currently is", () => {
    expect(wantIntentOf("where should we eat", WED_6PM)?.key).toBe("dinner");
    expect(wantIntentOf("where should we eat", new Date("2026-07-15T08:00:00-04:00"))?.key).toBe("breakfast");
    expect(wantIntentOf("restaurants open now", new Date("2026-07-15T08:00:00-04:00"))?.key).toBe("food");
  });
  it("never false-positives on the other grounders' questions", () => {
    expect(wantIntentOf("Music tonight", WED_6PM)).toBeNull();
    expect(wantIntentOf("where can I park downtown", WED_6PM)).toBeNull();
    expect(wantIntentOf("best parks for kids", WED_6PM)).toBeNull();
    expect(wantIntentOf("will it rain this weekend", WED_6PM)).toBeNull();
    expect(wantIntentOf("how do I report a pothole", WED_6PM)).toBeNull();
  });
});

describe("filterCitedSources", () => {
  const answer = "Alley Nights at Brewer's Alley has live music, and Alive @ Five kicks off at Carroll Creek.";
  const sources = [
    { name: "Voter registration", category: "civic" },
    { name: "Alley Nights", category: "event" },
    { name: "Alive @ Five · La Unica", category: "event" },
    { name: "Keeney and Basford Funeral Homes", category: "funeral" },
    { name: "County budget", category: "event" },
  ];
  it("drops uncited search noise, keeps cited cards and civic links (the funeral-home audit find)", () => {
    expect(filterCitedSources(sources, answer).map((s) => s.name)).toEqual([
      "Voter registration",
      "Alley Nights",
      "Alive @ Five · La Unica",
    ]);
  });
  it("keeps the top two as related when the answer names nothing", () => {
    const out = filterCitedSources(sources, "Nothing matches this prose at all.");
    expect(out.map((s) => s.name)).toEqual(["Voter registration", "Alley Nights", "Alive @ Five · La Unica"]);
  });
  it("null answer passes sources through untouched", () => {
    expect(filterCitedSources(sources, null)).toEqual(sources);
  });
  it("uncited civic cards cap at two; cited civic always stays (the voter-answer pile-up)", () => {
    const civicPile = [
      { name: "Voter registration", category: "civic" },
      { name: "County staff directory", category: "civic" },
      { name: "Meeting agendas", category: "civic" },
      { name: "County budget office", category: "civic" },
    ];
    const out = filterCitedSources(civicPile, "Register to vote through the county's voter registration page.");
    // Cited (voter registration) + the first two uncited grounders.
    expect(out.map((s) => s.name)).toEqual([
      "Voter registration",
      "County staff directory",
      "Meeting agendas",
    ]);
  });
});

describe("stripInlineMarkdown", () => {
  it("strips the exact emphasis that reached users raw (the Reddit screenshot)", () => {
    expect(
      stripInlineMarkdown("I can't tell you what's happening *tonight* specifically. But Frederick's got the **Alive @ Five** series"),
    ).toBe("I can't tell you what's happening tonight specifically. But Frederick's got the Alive @ Five series");
  });
  it("collapses code ticks and links to their text", () => {
    expect(stripInlineMarkdown("check `hours` on [the map](/map)")).toBe("check hours on the map");
  });
  it("removes the remaining common markdown forms", () => {
    expect(stripInlineMarkdown("> _Cafe Nola_ is ~~probably~~ closest.")).toBe(
      "Cafe Nola is probably closest.",
    );
    expect(stripInlineMarkdown("![Cafe Nola](photo.jpg) is nearby.")).toBe(
      "Cafe Nola is nearby.",
    );
  });
  it("leaves legitimate prose alone", () => {
    const s = "Shab Row & Everedy Square, 5-9 PM. A 4.5 star spot.";
    expect(stripInlineMarkdown(s)).toBe(s);
  });
});

describe("normalizePlainTextAnswer", () => {
  it("turns markdown bullets into separate grammatical sentences", () => {
    expect(
      normalizePlainTextAnswer("## Picks\n- **Cafe Nola** — closest\n- `Beans` — open later"),
    ).toBe("Cafe Nola is closest. Beans is open later.");
  });

  it("preserves complete numbered recommendations without joining them", () => {
    expect(
      normalizePlainTextAnswer(
        "1. Cafe Nola is the closest verified match.\n2) Beans & Bagels stays open later.",
      ),
    ).toBe("Cafe Nola is the closest verified match. Beans & Bagels stays open later.");
  });

  it("turns colon-style numbered picks into grammatical cited claims", () => {
    expect(
      normalizePlainTextAnswer(
        "Here are two choices:\n1. Cafe Nola: closest verified match\n2. Beans & Bagels: It stays open later",
      ),
    ).toBe(
      "Here are two choices. Cafe Nola is the closest verified match. For Beans & Bagels, it stays open later.",
    );
  });

  it("folds a wrapped list-item detail into the same grammatical sentence", () => {
    expect(
      normalizePlainTextAnswer(
        "### Three choices\n1. Cafe Nola — closest downtown\n   and it serves breakfast all day\n2. Beans & Bagels — open later",
      ),
    ).toBe("Cafe Nola is closest downtown and it serves breakfast all day. Beans & Bagels is open later.");
  });

  it("makes bare-name bullets grammatical instead of concatenating names", () => {
    expect(normalizePlainTextAnswer("- Cafe Nola\n- Beans & Bagels")).toBe(
      "Options include Cafe Nola and Beans & Bagels.",
    );
  });

  it("keeps ordinary prose as one plain-text paragraph", () => {
    expect(normalizePlainTextAnswer("Cafe Nola is closest.\nBeans stays open later.")).toBe(
      "Cafe Nola is closest. Beans stays open later.",
    );
  });

  it("drops a markdown heading instead of splicing it into prose", () => {
    expect(normalizePlainTextAnswer("## Best choice\nCafe Nola is closest.")).toBe(
      "Cafe Nola is closest.",
    );
  });

  it("keeps a noun-phrase list detail as a recommendation, not an identity", () => {
    expect(normalizePlainTextAnswer("- Cafe Nola — breakfast sandwiches and coffee")).toBe(
      "Consider Cafe Nola for its breakfast sandwiches and coffee.",
    );
  });

  it("does not turn an arbitrary business detail into a copula claim", () => {
    expect(normalizePlainTextAnswer("- Hootch & Banter: creekside patio")).toBe(
      "Consider Hootch & Banter for its creekside patio.",
    );
  });

  it("recognizes business names that contain a lower-case connector", () => {
    expect(normalizePlainTextAnswer("- Up on Market")).toBe(
      "Up on Market is one option.",
    );
  });

  it("preserves numeric ranges while cleaning prose dashes", () => {
    expect(normalizePlainTextAnswer("Cafe Nola – open 5 – 9 PM")).toBe(
      "Cafe Nola is open 5-9 PM.",
    );
  });
});

describe("concisePlainTextAnswer", () => {
  it("keeps complete sentences within the word budget", () => {
    const answer = [
      "Cafe Nola is the closest match and its current hours cover breakfast today.",
      "Beans and Bagels is another nearby option with a different menu.",
      "A third sentence adds detail that does not fit the compact answer.",
    ].join(" ");
    const concise = concisePlainTextAnswer(answer, 24);
    expect(concise).toBe(
      "Cafe Nola is the closest match and its current hours cover breakfast today. Beans and Bagels is another nearby option with a different menu.",
    );
  });

  it("uses a grammatical recovery message for one oversized sentence", () => {
    const answer = `${Array.from({ length: 90 }, () => "detail").join(" ")}.`;
    expect(concisePlainTextAnswer(answer, 20)).toBe(
      "That answer is too broad to show clearly. Ask for one town, time, or type of place and I will narrow it down.",
    );
  });
});

describe("requestedOptionCount", () => {
  it.each([
    ["Give me 4 coffee shops downtown", 4],
    ["What are the top three breweries?", 3],
    ["Show me a couple of dinner options", 2],
    ["I want several rainy-day ideas", "multiple"],
  ])("reads an explicit option request from %s", (query, expected) => {
    expect(requestedOptionCount(query)).toBe(expected);
  });

  it.each([
    "Build a three-hour plan",
    "What is the best 3-hour plan?",
    "Give me 3 hours in Frederick",
    "Find 2 tickets for tonight",
    "Dinner for 4 people",
    "Find coffee at 7:30",
    "What is the best breakfast sandwich?",
  ])("does not mistake another number for an option count: %s", (query) => {
    expect(requestedOptionCount(query)).toBeNull();
  });

  it("tells the model to honor the requested count without inventing citations", () => {
    const instruction = optionCountInstruction("Recommend five local breweries");
    expect(instruction).toContain("explicitly requested 5 options");
    expect(instruction).toContain("Name every choice so its source can be cited");
    expect(instruction).toContain("instead of inventing or padding");
  });
});
