import { beforeEach, describe, expect, it, vi } from "vitest";

// Positive availability scenarios need a stable reviewed fixture even when
// production legitimately withholds every expired schedule. Never refresh
// production timestamps just to make these tests pass.
vi.mock("@/data/places-client-hours.json", async () => ({
  default: (await import("../../../tests/fixtures/ask-reviewed-hours.json")).default,
}));
vi.mock("@/data/places-client.json", async (importOriginal) => {
  const original = await importOriginal<{ default: Array<{ slug: string }> }>();
  const hours = (await import("../../../tests/fixtures/ask-reviewed-hours.json")).default;
  const bySlug = new Map(hours.map((row) => [row.slug, row]));
  return { default: original.default.map((place) => ({ ...place, ...bySlug.get(place.slug) })) };
});

const foodTruckAvailabilityMocks = vi.hoisted(() => ({
  getFoodTruckAvailability: vi.fn(),
}));

vi.mock("@/lib/food-trucks/availability", () => ({
  getFoodTruckAvailability: foodTruckAvailabilityMocks.getFoodTruckAvailability,
}));
import {
  askFrederick,
  sourceHasVerifiedOpenStatus,
  temporalOpenPlaceHits,
} from "./answer";
import { freshHoursInstant } from "../../../tests/utils/freshHoursInstant";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { haversineMeters } from "@/lib/geo";
import { buildWantAnswer } from "@/lib/want-answer";

const downtown = {
  origin: { lng: -77.4105, lat: 39.4143 },
  municipality: "frederick",
  contextLabel: "your location",
} as const;

/** The Eastern calendar date (YYYY-MM-DD) an instant falls on. */
function easternCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** The Eastern wall clock (HH:MM) an instant falls on. */
function easternWallClock(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

describe("askFrederick structured answers", () => {
  beforeEach(() => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockReset();
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "unavailable",
      items: [],
    });
  });

  it("preserves a fresh verified-open state after adding a requested-time label", () => {
    expect(sourceHasVerifiedOpenStatus({
      slug: "timed-dinner",
      name: "Timed dinner",
      category: "restaurant",
      href: "/places/timed-dinner",
      status: "At 6:00 PM · Open until 10 PM",
    })).toBe(true);
    expect(sourceHasVerifiedOpenStatus({
      slug: "timed-dinner",
      name: "Timed dinner",
      category: "restaurant",
      href: "/places/timed-dinner",
      status: "At 6:00 PM · Likely open · check hours",
    })).toBe(false);
  });

  it("leads coffee-and-bikes with nearby Gravel & Grind", async () => {
    const result = await askFrederick("coffee and bikes", {
      origin: { lng: -77.40955, lat: 39.42165 },
      municipality: "frederick",
      contextLabel: "your location",
      canShowDistance: true,
    });

    expect(result.status).toBe("matches");
    expect(result.sources[0]).toMatchObject({
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
    });
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.sources).toHaveLength(1);
    expect(result.answer).toContain("covers the full request");
    expect(result.answer).not.toContain("Starbucks");
  });

  it("understands a complete coffee-and-bike request written in ordinary language", async () => {
    const result = await askFrederick(
      "Where can I get coffee and browse bikes near downtown Frederick?",
      {
        origin: { lng: -77.40955, lat: 39.42165 },
        municipality: "frederick",
        contextLabel: "Downtown Frederick",
        canShowDistance: true,
      },
    );

    expect(result.status).toBe("matches");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
    });
    expect(result.answer).not.toContain("Starbucks");
  });

  it("answers the recurring Brunswick taco request from the corrected local catalog", async () => {
    const result = await askFrederick("Where can I get tacos in Brunswick?", {
      origin: { lng: -77.6278, lat: 39.3143 },
      municipality: "brunswick",
      contextLabel: "Brunswick",
      canShowDistance: true,
    });

    expect(result.status).toBe("matches");
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        slug: "currys-kitchen-brunswick",
        name: "Adele's Tex Mex",
      }),
    );
    expect(result.answer).toContain("Adele's Tex Mex");
    expect(result.answer).not.toContain("Curry’s Kitchen");
  });

  it("returns evidence and proximity for a local place answer", async () => {
    const result = await askFrederick(
      "Where can I get a breakfast sandwich near me?",
      {
        origin: downtown.origin,
        contextLabel: "Near you",
        canShowDistance: true,
      },
    );
    expect(result.status).toBe("matches");
    expect(result.intent).toMatchObject({ kind: "place", label: "Breakfast sandwich" });
    expect(result.sources[0]).toMatchObject({
      slug: "beans-bagels-frederick",
      confidence: "high",
    });
    expect(result.sources[0].reason).toContain("breakfast sandwich");
    expect(result.sources[0].distance).toBeTruthy();
    expect(result.sources[0].status).toBeTruthy();
    expect(result.sources[0].phone).toBe("(301) 620-2165");
    expect(result.sources.every((source) => {
      const place = clientPlaceBySlug(source.slug);
      return !place || haversineMeters(downtown.origin, place.geom) <= 5_000;
    })).toBe(true);
    expect(result.actions?.some((action) => action.label === "Make it a plan")).toBe(true);
  });

  it("enforces a selected wheelchair fit and qualifies unknown access", async () => {
    const result = await askFrederick(
      "Where can I get coffee near me?",
      downtown,
      { fit: { accessibility: ["wheelchair"] } },
    );

    expect(result.sources.length).toBeGreaterThan(0);
    const places = result.sources.flatMap((source) => {
      const place = clientPlaceBySlug(source.slug);
      return place ? [{ source, place }] : [];
    });
    expect(places.every(({ place }) => place.accessibility?.wheelchair !== false))
      .toBe(true);
    const unknown = places.filter(
      ({ place }) => place.accessibility?.wheelchair == null,
    );
    expect(unknown.every(({ source }) =>
      source.detail?.includes("Wheelchair access is not confirmed") === true
    )).toBe(true);
    if (unknown.length > 0) {
      expect(result.answer).toContain("Wheelchair access is not confirmed");
    }
  });

  it("takes closest literally when the user asks for the closest grocery store", async () => {
    const result = await askFrederick("What grocery store is closest to me?", downtown);
    expect(result.sources[0]?.name).toBe("Costco Wholesale");
    expect(result.answer).toContain("closest matches");
    expect(result.answer).toContain("ranked by the location and hours available now");
  });

  it("does not invent proximity when a nearby request has no ranking origin", async () => {
    const result = await askFrederick("Where can I get coffee near me?", {
      contextLabel: "Whole county",
      fallbackReason: "location-unavailable",
    });
    expect(result.usedModel).toBe(false);
    expect(result.answer).toContain("countywide catalog matches, not a nearest-place claim");
    expect(result.context).toBe("Whole county");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.distance == null)).toBe(true);
  });

  it("keeps a selected-town coffee answer inside that town", async () => {
    const result = await askFrederick("Where can I get coffee near me?", {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    });

    expect(result.sources.length).toBeGreaterThan(0);
    expect(
      result.sources.every(
        (source) => clientPlaceBySlug(source.slug)?.municipality === "urbana",
      ),
    ).toBe(true);
    expect(result.sources.every((source) => source.distance == null)).toBe(true);
    expect(result.sources.some((source) => source.name === "Market Street Boba Beans")).toBe(false);
  });

  it("keeps Today and Ask on the same lead for the same town, noun, and clock", async () => {
    const now = freshHoursInstant(3, 14);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const context = {
        origin: { lng: -77.3523, lat: 39.3276 },
        municipality: "urbana",
        contextLabel: "Urbana",
        canShowDistance: false,
      } as const;
      const today = buildWantAnswer("coffee", null, context.origin, now, {
        approximateOrigin: true,
        municipality: context.municipality,
        contextLabel: context.contextLabel,
        contextSource: "town",
        rankingMode: "best-fit",
      });
      const ask = await askFrederick("Where can I get coffee in Urbana?", context);

      expect(today?.decision?.lead?.id).toBe(today?.hero?.slug);
      expect(ask.sources[0]?.slug).toBe(today?.decision?.lead?.id);
      expect(today?.decision?.scope).toMatchObject({
        label: "Urbana",
        source: "town",
      });
      expect(ask.context).toBe("Urbana");
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats timeless breakfast as a best-fit decision, not an open-chain race", async () => {
    const result = await askFrederick("Breakfast near me", {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    });

    expect(result.intent?.label).toBe("Breakfast");
    expect(result.sources[0]?.name).toBe("Pumpernickel + Rye");
    expect(result.sources.some((source) => source.name === "Giant Food")).toBe(false);
    expect(result.sources.every((source) => source.city === "Urbana")).toBe(true);
    expect(result.sources.every((source) => source.distance == null)).toBe(true);
  });

  it("never presents closed Urbana coffee shops as open-now matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:30:00.000Z"));
    try {
      const result = await askFrederick("coffee right now in Urbana", {
        origin: { lng: -77.3523, lat: 39.3276 },
        municipality: "urbana",
        contextLabel: "Urbana",
        canShowDistance: false,
      });

      expect(result.intent?.timeNeed).toBe("now");
      expect(result.sources.every((source) => source.href.startsWith("/places/"))).toBe(true);
      expect(
        result.sources.every(
          (source) => !/^(?:Open\b|Closing soon\b)/.test(source.status ?? ""),
        ),
      ).toBe(true);
      expect(result.answer).toContain("couldn’t verify a coffee place open right now");
      if (result.sources.length > 0) {
        expect(result.answer).toMatch(
          result.sources.every((source) => /^Closed\b/.test(source.status ?? ""))
            ? /cards show when they reopen/
            : /check their hours/,
        );
      } else {
        expect(result.answer).toContain("check the full map");
      }
      expect(result.answer).not.toContain("strong matches");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not duplicate an article in an unavailable open-now answer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:30:00.000Z"));
    try {
      const result = await askFrederick(
        "Where can I get a breakfast sandwich near downtown Frederick right now?",
        downtown,
      );

      expect(result.answer).toContain(
        "couldn’t verify a breakfast sandwich open right now",
      );
      expect(result.answer).not.toContain("a a breakfast");
    } finally {
      vi.useRealTimers();
    }
  });

  it("recommends only verified-open ice cream after the requested time", async () => {
    const now = freshHoursInstant(6, 16); // Saturday noon Eastern in summer.
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const result = await askFrederick(
        "where can I take my kids for ice cream after 8pm tonight",
        downtown,
      );

      expect(result.intent).toMatchObject({
        kind: "place",
        requestedTime: "8:00 PM",
      });
      expect(result.intent?.requestedDateTime).toBeTruthy();
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.some((source) => source.name === "Zoe's Chocolate Company")).toBe(false);
      expect(
        result.sources.every((source) =>
          /^At 8:00 PM · (?:Open|Closing soon)\b/.test(
            source.status ?? "",
          ),
        ),
      ).toBe(true);
      expect(result.answer).not.toContain("Zoe's Chocolate Company");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never calls a place open past midnight unless fresh hours confirm it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T16:00:00.000Z"));
    try {
      const result = await askFrederick(
        "what is open past midnight tonight",
        downtown,
      );

      expect(result.intent).toMatchObject({
        kind: "place",
        requestedTime: "12:00 AM",
        requestedDateTime: "2026-08-04T04:00:00.000Z",
      });
      expect(result.sources.some((source) => source.name === "Dancing Bear Toys and Games")).toBe(false);
      expect(
        result.sources.every((source) =>
          /^At 12:00 AM · (?:Open|Closing soon)\b/.test(
            source.status ?? "",
          ),
        ),
      ).toBe(true);
      if (result.sources.length === 0) {
        expect(result.answer).toContain("couldn’t verify");
      }
      expect(result.answer).not.toContain("Dancing Bear Toys and Games");
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters the full nearby catalog for the requested time before applying the result cap", async () => {
    vi.useFakeTimers();
    // Clock must postdate the newest hours_updated_at in the snapshot:
    // a fake time set BEFORE the data's own timestamps reads every
    // schedule as unverifiable and empties the open-past-midnight set.
    // Derived from the snapshot rather than hard-coded, so an hours refresh
    // moving the data forward cannot silently empty this test.
    vi.setSystemTime(freshHoursInstant(1, 16)); // Monday, noon Eastern.
    try {
      const result = await askFrederick(
        "what is open past midnight near me",
        {
          origin: downtown.origin,
          municipality: "frederick",
          contextLabel: "your location",
          canShowDistance: true,
        },
      );

      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.every((source) =>
        /^At 12:00 AM · (?:Open|Closing soon)\b/.test(source.status ?? "")
      )).toBe(true);
      expect(result.sources[0]?.distance).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters a complete temporal catalog before applying the result cap", () => {
    const template = clientPlaceBySlug("cugino-forno-frederick");
    expect(template).toBeDefined();
    if (!template) throw new Error("Expected a place fixture");

    const closed = Array.from({ length: 13 }, (_, index) => ({
      ...template,
      slug: `closed-before-cap-${index}`,
      name: `Closed before cap ${index}`,
      feature_score: 10 - index / 100,
      hours: { mon: [{ open: "08:00", close: "17:00" }] },
      hours_verified: true,
      hours_updated_at: "2026-08-10T12:00:00.000Z",
    }));
    const openAfterCap = {
      ...template,
      slug: "open-after-cap",
      name: "Open after cap",
      feature_score: 1,
      hours: { mon: [{ open: "18:00", close: "01:00" }] },
      hours_verified: true,
      hours_updated_at: "2026-08-10T12:00:00.000Z",
    };

    const hits = temporalOpenPlaceHits(
      {
        origin: downtown.origin,
        municipality: "frederick",
        contextLabel: "your location",
        canShowDistance: true,
      },
      new Date("2026-08-11T04:00:00.000Z"),
      12,
      {
        downtown: false,
        regions: [],
        queryMunicipality: null,
        preciseNearMe: true,
      },
      [...closed, openAfterCap],
    );

    expect(hits.map((hit) => hit.type === "place" ? hit.place.slug : hit.type))
      .toEqual(["open-after-cap"]);
  });

  it("treats a future date word as scheduling, not a place-search keyword", async () => {
    vi.useFakeTimers();
    // Keep the clock at or after the current reviewed-hours snapshot. A fake
    // clock before its verification timestamps correctly makes every schedule
    // unconfirmed and cannot prove a midnight opening.
    const now = freshHoursInstant(1, 16); // Monday, noon Eastern.
    vi.setSystemTime(now);
    try {
      const result = await askFrederick(
        "what is open past midnight tomorrow",
        downtown,
      );

      // "Past midnight tomorrow" is the midnight that ENDS tomorrow, i.e. two
      // Eastern calendar days on at 00:00. Assert that meaning rather than a
      // literal instant, which was only correct for one snapshot's clock.
      expect(result.intent?.kind).toBe("place");
      const requested = new Date(result.intent?.requestedDateTime ?? "");
      expect(easternCalendarDate(requested)).toBe(
        easternCalendarDate(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)),
      );
      expect(easternWallClock(requested)).toBe("00:00");
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.every((source) =>
        /^At 12:00 AM · (?:Open|Closing soon)\b/.test(source.status ?? "")
      )).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses downtown as a ranking scope without exposing center-point distances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(freshHoursInstant(1, 16)); // Monday, noon Eastern.
    try {
      const result = await askFrederick(
        "what is open past midnight downtown Frederick",
        {
          origin: downtown.origin,
          contextLabel: "your location",
          canShowDistance: true,
        },
      );

      expect(result.context).toBe("Downtown Frederick");
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.every((source) => source.distance == null)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers a nonexistent DST wall time with a clarification, not a mislabeled hours claim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T17:00:00.000Z"));
    try {
      const result = await askFrederick(
        "what is open after 2:30am March 8 2026",
        downtown,
      );

      expect(result.status).toBe("empty");
      expect(result.sources).toEqual([]);
      expect(result.answer).toContain("does not occur in Frederick");
      expect(result.answer).toContain("clocks move forward");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an exact match with safely withheld hours as an unconfirmed alternative", async () => {
    // The generated client artifact intentionally removes schedules older
    // than the seven-day policy window. Keep the exact place visible, but do
    // not turn its retained verification timestamp into a current-hours claim.
    const carrier = clientPlaceBySlug("dutchs-daughter-frederick");
    expect(carrier?.hours_updated_at).toBeTruthy();
    const verifiedAt = Date.parse(carrier?.hours_updated_at ?? "");
    vi.useFakeTimers();
    const now = new Date(verifiedAt + 24 * 60 * 60 * 1000);
    vi.setSystemTime(now);
    const beyondWindow = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
      .format(new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000))
      .replace(",", "");
    try {
      const result = await askFrederick(
        `Dutch's Daughter nearby after 10pm ${beyondWindow}`,
        downtown,
      );

      expect(result.sources).toContainEqual(
        expect.objectContaining({
          slug: "dutchs-daughter-frederick",
          status: "At 10:00 PM · Hours not posted",
        }),
      );
      expect(result.answer).toContain("couldn’t verify");
      expect(result.answer).not.toContain("It's open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an open-now restaurant request nearby when fresh hours are unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:30:00.000Z"));
    try {
      const result = await askFrederick("restaurants open now near me", {
        origin: downtown.origin,
        contextLabel: "Near you",
        canShowDistance: true,
      });

      expect(result.intent?.label).not.toBe("Breakfast");
      expect(result.answer).toContain("couldn’t verify a food place open right now");
      expect(result.sources.every((source) => {
        const place = clientPlaceBySlug(source.slug);
        return !place || !place.geom || haversineMeters(downtown.origin, place.geom) <= 5_000;
      })).toBe(true);
      expect(result.actions?.some((action) => action.label === "Browse nearby food")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an honest empty answer for unsupported product language", async () => {
    const result = await askFrederick(
      "Where can I buy zxqv quux near Frederick?",
      downtown,
    );

    expect(result).toMatchObject({ status: "empty", usedModel: false });
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("couldn’t find a reliable match");
    expect(result.answer).not.toMatch(/strongest matches/i);
  });

  it("names a saved-home ranking anchor instead of calling it the user's location", async () => {
    const result = await askFrederick("What grocery store is closest to me?", {
      origin: { lng: -77.6278, lat: 39.3143 },
      contextLabel: "Ranked from Brunswick",
    });
    expect(result.answer).toContain("closest matches");
    expect(result.answer).toContain("from Brunswick");
    expect(result.answer).not.toContain("to your location");
  });

  it("puts the official voter-registration action first", async () => {
    const result = await askFrederick("How do I register to vote in Frederick County?", downtown);
    expect(result.sources[0]).toMatchObject({
      slug: "register-vote",
      name: "Frederick County · Voter registration",
      category: "civic",
      href: "https://frederickcountymd.gov/1648/Voter-Registration---RegisterMake-Change",
      confidence: "high",
    });
    expect(result.answer).toContain("official Frederick resource");
    expect(result.sources).toHaveLength(1);
  });

  it("does not turn an ordinary and-query into a department answer", async () => {
    const result = await askFrederick("beer and food tonight", downtown);
    expect(result.sources.some((source) => source.slug.startsWith("dept-"))).toBe(false);
    expect(result.answer).not.toMatch(/official contact for/i);
  });

  it("keeps a mixed coffee-and-amenity request from collapsing to one tool", async () => {
    const result = await askFrederick("coffee and a trash can near me", downtown);
    expect(result.sources.some((source) => source.href.startsWith("/places/"))).toBe(true);
    expect(result.sources.some((source) => source.category === "trash")).toBe(true);
    expect(result.answer).toMatch(/trash can/i);
  });

  it("routes pet and human poison emergencies to dedicated official actions", async () => {
    const pet = await askFrederick("My dog ate chocolate. I need an emergency vet", downtown);
    expect(pet.usedModel).toBe(false);
    expect(pet.sources.some((source) => source.name === "ASPCA Animal Poison Control")).toBe(true);
    expect(pet.actions?.some((action) => action.href === "/emergency-vet")).toBe(true);

    const human = await askFrederick("Who do I call for a possible poisoning?", downtown);
    expect(human.answer).toContain("1-800-222-1222");
    expect(human.actions?.some((action) => action.href === "tel:+18002221222")).toBe(true);
    expect(human.actions?.some((action) => action.href === "sms:911")).toBe(true);
  });

  it("offers Frederick County Text-to-911 for a human emergency", async () => {
    const result = await askFrederick(
      "Where is the nearest emergency room for a medical emergency?",
      downtown,
    );
    expect(result.answer).toContain(
      "text 911 if a voice call is not possible",
    );
    expect(
      result.actions?.some((action) => action.href === "sms:911"),
    ).toBe(true);
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        slug: "frederick-text-911",
        href: "https://frederickcountymd.gov/8480/Texting-9-1-1-What-to-Expect",
      }),
    );
  });

  it("keeps a written-contact request to a published email source", async () => {
    const result = await askFrederick(
      "How can I contact the Maryland Deaf Community Center without calling?",
      downtown,
    );

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        slug: "maryland-deaf-center",
        email: "info@deafmdcc.org",
      }),
    );
    expect(
      result.sources
        .filter((source) => source.href.startsWith("/places/"))
        .every((source) => Boolean(source.email)),
    ).toBe(true);
  });

  it("keeps City of Frederick trash information out of the county flow", async () => {
    const result = await askFrederick("When is trash pickup?", downtown);
    expect(result.sources[0]).toMatchObject({
      name: "City of Frederick · Trash & recycling",
      href: "https://www.cityoffrederickmd.gov/220/Refuse-Recycling",
    });
  });

  it("routes a downtown pothole to City public works", async () => {
    const result = await askFrederick("Who handles a pothole?", downtown);
    expect(result.sources[0]).toMatchObject({
      slug: "dept-city-public-works",
      name: "City of Frederick · Public Works (DPW)",
      phone: "301-600-1440",
    });
    expect(result.sources.some((source) => source.href.includes("frederickcountymd.gov/8235"))).toBe(false);
    expect(result.sources).toHaveLength(1);
  });

  it("uses a town's municipal record instead of a county substitute", async () => {
    const result = await askFrederick("Who handles trash in Brunswick?", {
      municipality: "brunswick",
      contextLabel: "Brunswick",
    });
    // Brunswick publishes no dedicated refuse contact, so the trash intent
    // resolves to the office that handles it. Asserting Public Works rather
    // than the town hall keeps this pinned to the answer we want: before the
    // fallback existed this passed only because the hall carried no website
    // and fell back to the source URL, which happened to be /publicworks.
    expect(result.sources[0]).toMatchObject({
      name: "Brunswick · Public Works",
      href: "https://brunswickmd.gov/publicworks",
      phone: "301-834-7500",
    });
    // Resolving to Public Works is a department-specific match, so the answer
    // no longer carries the "instead of guessing" hedge. That disclaimer is for
    // the case where only the town's front door is known; keeping it here would
    // apologize for an answer that is now exact.
    expect(result.answer).toContain("official Brunswick resource for public works");
  });

  it("answers the countywide dining question with balanced north and west picks", async () => {
    const query = "I've eaten pretty much all of DTF, central and eastern Frederick. But you don't hear about the other parts of the county. Curious if there are good spots in the northern or western portion of the county?";
    const result = await askFrederick(query, downtown);
    expect(result.usedModel).toBe(false);
    expect(result.sources).toHaveLength(4);
    expect(result.sources.map((source) => source.region)).toEqual(["north", "west", "north", "west"]);
    expect(result.sources.every((source) => source.category !== "civic" && source.city?.toLowerCase() !== "frederick")).toBe(true);
    expect(result.answer).toContain("In northern Frederick County");
    expect(result.answer).toContain("In western Frederick County");
    expect(result.answer).not.toContain("food license");
    expect(result.context).toBe("North + West Frederick County");
  });

  it("ignores regions in the user's dining history before a direct regional question", async () => {
    const query = "I have eaten downtown and central Frederick. What are good restaurants in northern or western Frederick County?";
    const result = await askFrederick(query, downtown);
    expect(result.intent?.regions).toEqual(["north", "west"]);
    expect(result.sources).toHaveLength(4);
    expect(result.sources.map((source) => source.region)).toEqual(["north", "west", "north", "west"]);
    expect(result.sources.every((source) => source.city?.toLowerCase() !== "frederick")).toBe(true);
    expect(result.answer).not.toContain("central Frederick County, try");
  });

  it("never fills an empty dated activity window with unrelated businesses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T04:30:00.000Z"));
    try {
      const result = await askFrederick("Anything fun tomorrow night?", downtown);
      expect(result.intent).toMatchObject({ kind: "event", timeNeed: "tomorrow" });
      expect(result.usedModel).toBe(false);
      expect(result.sources.every((source) => source.href.startsWith("/events/"))).toBe(true);
      expect(result.sources.some((source) => /funeral|zoning|family support/i.test(source.name))).toBe(false);
      expect(result.sources.every((source) => /Jul 24/i.test(source.eyebrow ?? ""))).toBe(true);
      if (result.sources.length === 0) {
        expect(result.answer).toContain("couldn’t find a current Radius event");
        expect(result.actions?.[0]).toMatchObject({
          label: "Open the full calendar",
          href: "/events",
        });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns a natural request into an editable grounded itinerary", async () => {
    const result = await askFrederick("Plan a walkable 3 hour date night, local only", downtown);
    expect(result.status).toBe("matches");
    expect(result.usedModel).toBe(false);
    expect(result.intent).toMatchObject({
      kind: "plan",
      audience: "date",
      travelMode: "walk",
      localOnly: true,
    });
    expect(result.plan?.href).toMatch(/^\/plan\?p=/);
    expect(result.plan?.stops.length).toBeGreaterThanOrEqual(2);
    expect(result.plan?.stops.every((stop) => stop.href.startsWith("/"))).toBe(true);
    expect(result.plan?.stops.every((stop) => stop.status !== "Check hours")).toBe(true);
    const hasUnconfirmedHours = result.plan?.stops.some(
      (stop) => stop.status === "Hours unconfirmed",
    );
    expect(
      result.answer?.includes("Hours are not confirmed for every stop") ??
        false,
    ).toBe(hasUnconfirmedHours);
  });

  it.each(["I have two hours in Brunswick this afternoon. What can I do?", "Plan the next two hours in Brunswick"])("keeps a timed Brunswick request useful without invented availability: %s", async (query) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T18:00:00Z"));
    try {
      const result = await askFrederick(query, downtown);
      expect(result.plan).toBeNull();
      expect(result.intent).toMatchObject({ kind: "plan", durationHours: 2 });
      expect(result.context).toBe("Brunswick");
      expect(result.answer).toContain("does not have current verified hours");
      expect(result.sources.every((source) => source.city === "Brunswick" && source.status === "Visit time unconfirmed")).toBe(true);
      expect(result.actions?.some((action) => action.href === "/m/brunswick")).toBe(true);
      expect(result.actions?.some((action) => action.kind === "refine")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a lower-walking parent draft and labels unconfirmed hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T14:00:00.000Z"));
    try {
      const result = await askFrederick(
        "Plan an evening with easy parking and less walking for my parents",
        downtown,
      );
      expect(result.usedModel).toBe(false);
      expect(result.intent).toMatchObject({ audience: "visitor", travelMode: "drive" });
      expect(result.answer).toContain("two stops");
      expect(result.answer).not.toContain("walkable");
      expect(result.plan?.stops).toHaveLength(2);
      expect(result.plan?.stops[0]?.time).toBe("6:00 PM");
      expect(result.plan?.stops.every((stop) => stop.status !== "Check hours")).toBe(true);
      expect(result.answer).toContain("Hours are not confirmed for every stop");
      expect(result.plan?.stops.some((stop) => Boolean(stop.tip))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers physical amenity questions from the amenity layer, never civic search noise", async () => {
    const result = await askFrederick(
      "Where can I find a public trash can or drinking water downtown?",
      downtown,
    );
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["amenities"]);
    expect(result.sources.every((source) => ["trash", "water"].includes(source.category))).toBe(true);
    expect(result.sources.some((source) => source.category === "trash")).toBe(true);
    expect(result.sources.some((source) => source.category === "water")).toBe(true);
    expect(result.sources.every((source) => source.href.startsWith("/map?amenity="))).toBe(true);
    expect(result.sources.some((source) => /bus|connector/i.test(source.name))).toBe(false);
    expect(result.actions?.some((action) => action.href === "/map?amenity=trash")).toBe(true);
    expect(result.answer).not.toContain("verified trash");
    expect(result.sources.every((source) => !source.reason?.includes("Verified mapped"))).toBe(true);
  });

  it("finds a public bike-repair station without treating a bike shop as the answer", async () => {
    const result = await askFrederick("Where is the nearest bike repair station?", downtown);
    expect(result.intelligence?.tools).toEqual(["amenities"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.category === "bike-repair")).toBe(true);
    expect(result.sources.every((source) => source.href.startsWith("/map?amenity=bike"))).toBe(true);
  });

  it("uses venue-verified schedules for brunch instead of generic restaurant hours", async () => {
    const result = await askFrederick("Who has verified brunch this weekend near me?", downtown);
    expect(result.intelligence?.tools).toEqual(["brunch"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.eyebrow === "Verified brunch schedule")).toBe(true);
    expect(result.sources.every((source) => /sat|sun|daily/i.test(source.status ?? ""))).toBe(true);
  });

  it("joins a destination to the nearest city garages", async () => {
    const result = await askFrederick("Where should I park for the Weinberg Center?", downtown);
    expect(result.intelligence?.tools).toContain("parking");
    expect(result.sources[0]).toMatchObject({
      name: "Court Street Garage",
      category: "parking",
      confidence: "high",
    });
    expect(result.answer).toContain("uses walking distance and does not show live space availability");
    expect(result.sources.every((source) => source.category === "parking")).toBe(true);
  });

  it("understands a plain downtown parking question", async () => {
    const result = await askFrederick(
      "Where should I park downtown right now?",
      downtown,
    );
    expect(result.intelligence?.tools).toContain("parking");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(
      result.sources.every((source) => source.category === "parking"),
    ).toBe(true);
  });

  it("treats parking near me as location context, not a place named me", async () => {
    const result = await askFrederick("Where can I park near me?", downtown);
    expect(result.intelligence?.tools).toContain("parking");
    expect(result.sources[0]?.category).toBe("parking");
    expect(result.answer).not.toContain("identify");
  });

  it("does not silently use downtown as the anchor for parking near me", async () => {
    const result = await askFrederick("Where can I park near me?", {
      contextLabel: "Whole county",
      fallbackReason: "location-unavailable",
    });
    expect(result.usedModel).toBe(false);
    expect(result.answer).toContain("I don’t have a precise location or selected town");
    expect(result.answer).not.toContain("closest mapped city garage to downtown Frederick");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.distance == null)).toBe(true);
  });

  it("does not recommend downtown garages for a far-county parking anchor", async () => {
    const result = await askFrederick("Where can I park near me?", {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
    });
    expect(result.status).toBe("empty");
    expect(result.answer).toContain("outside the downtown Frederick garage area");
    expect(result.sources).toEqual([]);
  });

  it("does not build a downtown itinerary for a locationless near-me plan", async () => {
    const result = await askFrederick("Plan an easy afternoon near me", {
      contextLabel: "Whole county",
      fallbackReason: "location-unavailable",
    });
    expect(result.usedModel).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.answer).toContain("I won’t silently treat downtown Frederick as your location");
    expect(result.actions?.some((action) => action.label === "Choose a town")).toBe(true);
  });

  it("is honest about roaming food trucks and links to current sources", async () => {
    const result = await askFrederick("Where are the food trucks today?", downtown);
    expect(result.intelligence?.tools).toEqual(["food-trucks"]);
    expect(result.answer).toContain("no operator-confirmed live pin is available right now");
    expect(result.answer).toContain("Publisher schedules are unavailable");
    expect(result.answer).toContain("cannot confirm that no stops are listed");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.category === "food-truck")).toBe(true);
    expect(
      result.sources.every((source) =>
        /own feed|does not have a current service schedule|resident kitchen/i.test(source.reason ?? "")
      ),
    ).toBe(true);
    expect(result.sources.find((source) => source.name === "The Alley Wagon")).toMatchObject({
      href: "/places/monocacy-brewing-frederick",
    });
    expect(result.actions?.some((action) => action.href === "/food-trucks")).toBe(true);
  });

  it("puts an operator-confirmed truck ahead of a separately labeled published stop", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "current",
      items: [
        {
          id: "beacon:in10se-bbq",
          kind: "operator-live",
          truckSlug: "in10se-bbq",
          name: "In10se BBQ",
          cuisine: "Barbecue",
          lat: 39.414,
          lng: -77.41,
          municipality: "Frederick",
          spot: "Baker Park",
          note: "Brisket until sold out",
          startsAt: "2026-08-22T17:00:00.000Z",
          endsAt: "2026-08-22T21:00:00.000Z",
          sourceName: "Operator live beacon",
          sourceUrl: "/food-trucks#truck-in10se-bbq",
          sourceConfidence: "operator",
          href: "/food-trucks#truck-in10se-bbq",
        },
        {
          id: "schedule:stop-1:grilled-cheese-please",
          kind: "published-stop",
          truckSlug: "grilled-cheese-please",
          name: "Grilled Cheese Please!",
          cuisine: "Grilled cheese",
          lat: 39.416,
          lng: -77.412,
          venueName: "Test Venue",
          municipality: "Frederick",
          startsAt: "2026-08-22T19:00:00.000Z",
          endsAt: "2026-08-22T22:00:00.000Z",
          sourceName: "Test Venue",
          sourceUrl: "https://example.com/schedule",
          sourceConfidence: "venue",
          href: "/food-trucks#truck-grilled-cheese-please",
        },
      ],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    try {
      const result = await askFrederick("Where are the food trucks today?", downtown);
      expect(result.status).toBe("matches");
      expect(result.sources[0]).toMatchObject({
        name: "In10se BBQ",
        eyebrow: "Operator confirmed live",
        status: "Out now until 5pm",
      });
      expect(result.sources[1]).toMatchObject({
        name: "Grilled Cheese Please!",
        eyebrow: "Published stop",
        status: "Published for today at 3pm",
      });
      expect(result.sources[1]?.detail).toContain("not confirmation");
      expect(result.answer).toContain("operator-confirmed live pin");
      expect(result.answer).toContain("published stop");
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns that a partial publisher schedule may omit other stops", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "partial",
      items: [{
        id: "schedule:stop-1:in10se-bbq",
        kind: "published-stop",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.414,
        lng: -77.41,
        venueName: "Test Venue",
        municipality: "Frederick City",
        startsAt: "2026-08-22T19:00:00.000Z",
        endsAt: "2026-08-22T22:00:00.000Z",
        sourceName: "Test Venue",
        sourceUrl: "https://example.com/schedule",
        sourceConfidence: "venue",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    try {
      const result = await askFrederick("Where are the food trucks today?", downtown);
      expect(result.status).toBe("matches");
      expect(result.answer).toContain("Some publisher schedules did not answer");
      expect(result.answer).toContain("other stops may be missing");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not describe a complete publisher failure as an empty current schedule", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "unavailable",
      items: [],
    });

    const result = await askFrederick("Where are the food trucks today?", downtown);

    expect(result.answer).toContain("Publisher schedules are unavailable");
    expect(result.answer).toContain("cannot confirm that no stops are listed");
    expect(result.answer).not.toContain("No current published stop");
  });

  it("does not leak a live pin from another town into a town-scoped answer", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "current",
      items: [{
        id: "beacon:in10se-bbq",
        kind: "operator-live",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.62,
        lng: -77.41,
        municipality: "Thurmont",
        startsAt: "2026-08-22T17:00:00.000Z",
        endsAt: "2026-08-22T21:00:00.000Z",
        sourceName: "Operator live beacon",
        sourceUrl: "/food-trucks#truck-in10se-bbq",
        sourceConfidence: "operator",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });

    const result = await askFrederick("Where are the food trucks today?", {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    });
    expect(result.sources.some((source) => source.slug === "beacon:in10se-bbq"))
      .toBe(false);
    expect(result.answer).toContain("no operator-confirmed live pin");
  });

  it("does not treat an unknown-location published stop as being in every town", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "current",
      items: [{
        id: "schedule:unknown-town:in10se-bbq",
        kind: "published-stop",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        venueName: "Community event",
        startsAt: "2026-08-22T19:00:00.000Z",
        endsAt: "2026-08-22T21:00:00.000Z",
        sourceName: "Event organizer",
        sourceUrl: "https://example.com/schedule",
        sourceConfidence: "organizer",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });

    const result = await askFrederick("Where are the food trucks today?", {
      origin: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
      contextLabel: "Urbana",
      canShowDistance: false,
    });

    expect(result.sources.some((source) =>
      source.slug === "schedule:unknown-town:in10se-bbq"
    )).toBe(false);
    expect(result.answer).toContain("no operator-confirmed live pin");
  });

  it("does not count a later weekly stop as current for a today request", async () => {
    foodTruckAvailabilityMocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-08-22T18:00:00.000Z",
      scheduleState: "current",
      items: [{
        id: "schedule:next-week:in10se-bbq",
        kind: "published-stop",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        venueName: "Test Venue",
        municipality: "Frederick City",
        startsAt: "2026-08-27T19:00:00.000Z",
        endsAt: "2026-08-27T22:00:00.000Z",
        sourceName: "Test Venue",
        sourceUrl: "https://example.com/schedule",
        sourceConfidence: "venue",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    try {
      const result = await askFrederick("Where are the food trucks today?", downtown);
      expect(result.sources.some((source) =>
        source.slug === "schedule:next-week:in10se-bbq"
      )).toBe(false);
      expect(result.answer).toContain("No published stop is listed for that time");
      expect(result.answer).not.toMatch(/Radius found \d+ current published stop/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the postal layer for the nearest blue mailbox", async () => {
    const result = await askFrederick("Where is the nearest blue USPS mailbox?", downtown);
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["shipping"]);
    expect(result.sources[0]).toMatchObject({
      name: "USPS mailbox",
      category: "mailbox",
    });
    expect(result.sources[0]?.href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir/);
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.sources.every((source) => source.slug.startsWith("shipping-mailbox-"))).toBe(true);
    expect(result.answer).toContain("USPS collection boxes");
    expect(result.answer).not.toMatch(/USPS USPS|boxs/);
  });

  it("keeps a FedEx package request on FedEx counters", async () => {
    const result = await askFrederick("Where can I drop off a FedEx package?", downtown);
    expect(result.intelligence?.tools).toEqual(["shipping"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => /fedex/i.test(`${source.name} ${source.eyebrow}`))).toBe(true);
    expect(result.sources.some((source) => /property zoning|family support/i.test(source.name))).toBe(false);
  });

  it("keeps live-music source cards limited to actual calendar events", async () => {
    const result = await askFrederick("What live music is happening tonight?", downtown);
    expect(result.sources.every((source) => source.href.startsWith("/events/"))).toBe(true);
    expect(result.sources.every((source) => source.category === "music" || source.category === "arts")).toBe(true);
    expect(result.sources.some((source) => /yoga|meeting|playground/i.test(source.name))).toBe(false);
  });

  it("can anchor a plan on a real place named in the request", async () => {
    // At 7:50 PM, starting immediately leaves less than the planner's full
    // restaurant stop before Hootch closes. An undated request should use the
    // next complete evening window, not quietly replace the named anchor.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T23:50:00.000Z"));
    try {
      const result = await askFrederick("Plan a date night around Hootch & Banter", downtown);
      expect(result.intent).toMatchObject({ timeNeed: null });
      // The lead names the anchor and the actual itinerary (pick-first
      // rule), not the planner's process.
      expect(result.answer).toContain("Anchored at Hootch & Banter");
      expect(result.answer).toContain("Hootch & Banter at ");
      expect(result.plan?.stops[0].name).toBe("Hootch & Banter");
      expect(result.plan?.stops[0].time).toBe("7:50 PM");
      expect(result.plan?.stops[0].status).toBe("Hours unconfirmed");
      expect(result.answer).toContain("Hours are not confirmed for every stop");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a usable named evening anchor in the current window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T22:01:00.000Z"));
    try {
      const result = await askFrederick("Plan a date night around Hootch & Banter", downtown);
      expect(result.answer).toContain("Anchored at Hootch & Banter");
      expect(result.plan?.stops[0]).toMatchObject({
        name: "Hootch & Banter",
        time: "6:01 PM",
      });
      expect(result.plan?.dateLabel).toBe("Today");
      expect(result.answer).not.toContain("Tomorrow:");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a timed reservation handoff honest when schedules are stale", async () => {
    const result = await askFrederick(
      "i want a steak dinner tonight use open table to make a rev for 7:30pm tonight",
      downtown,
    );

    expect(result.usedModel).toBe(false);
    expect(result.intent).toMatchObject({
      kind: "place",
      reservation: true,
      requestedTime: "7:30 PM",
    });
    expect(result.answer).toContain("can’t see live OpenTable inventory");
    expect(result.answer).toContain("7:30 PM");
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain("won’t pad the answer");
    expect(result.actions?.[0]).toMatchObject({
      kind: "open",
    });
    expect(result.actions?.[0]?.label).toContain("Check OpenTable");
    expect(result.actions?.[0]?.label).toContain("7:30 PM");
    expect(result.actions?.[0]?.href).toMatch(/^https:\/\/www\.opentable\.com\/s\?/);
    const handoff = new URL(result.actions?.[0]?.href ?? "");
    expect(handoff.searchParams.get("dateTime")).toMatch(/T19:30:00$/);
    expect(result.actions?.map((action) => action.label).slice(1)).toEqual([
      "Closest matches",
      "Make it a dinner plan",
    ]);
  });

  it("uses verified patio evidence and is honest about unmeasured noise", async () => {
    const result = await askFrederick("quiet patio where I can read", downtown);
    expect(result.sources[0]?.name).toBe("The Wine Kitchen on the Creek");
    expect(result.sources.some((source) => /Threaded|H Mart/i.test(source.name))).toBe(false);
    expect(result.answer).toContain("does not have verified noise-level data");
    expect(result.answer).not.toMatch(/\bis quiet\b/i);
  });

  it("answers a nearest-stop question from the committed GTFS stop layer", async () => {
    const result = await askFrederick("Where is the nearest bus stop?", downtown);
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["transit"]);
    expect(result.sources[0]).toMatchObject({
      name: "Square Corner (East Patrick Street at North Market Street)",
      category: "transit",
      confidence: "high",
    });
    expect(result.sources[0]?.href).toContain("show=transit");
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.answer).toContain("fare-free");
  });

  it("keeps a current bus-service question on the transit tools and official schedule", async () => {
    const result = await askFrederick("Can I catch a bus right now?", downtown);

    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["transit"]);
    expect(result.sources.map((source) => source.name)).toEqual([
      "Frederick County TransIT",
      "Official Connector schedules",
    ]);
    expect(result.sources.every((source) => source.category === "transit")).toBe(true);
    expect(result.sources.map((source) => source.href)).toEqual([
      "/transit",
      "https://www.frederickcountymd.gov/199/Connector-Schedules",
    ]);
    expect(result.actions?.map((action) => action.label)).toEqual([
      "Open the live transit map",
      "Check official schedules",
    ]);
    expect(result.actions?.some((action) => /plan|independent|walking/i.test(action.label))).toBe(false);
    expect(result.answer).toContain("cannot confirm a specific departure");
  });

  it("evaluates late-night food at a real late-night hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));
    try {
      const result = await askFrederick("late night food near me", downtown);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(
        result.sources.every(
          (source) => !/^(?:Open\b|Closing soon\b)/.test(source.status ?? ""),
        ),
      ).toBe(true);
      expect(result.answer).toContain("couldn’t verify a late-night place open at 11:00 PM");
      expect(result.answer).toContain("check their hours");
      expect(result.answer).not.toContain("Wag's Restaurant");
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers happy hour from verified live schedules, not generic bars", async () => {
    vi.useFakeTimers();
    // Derived from the committed hours stamps, not a literal date: a literal
    // drifts out of the 7-day freshness window (or reads newer stamps as
    // corrupt-future) every time the hours data refreshes — issue #1529.
    vi.setSystemTime(freshHoursInstant(3, 21)); // a Wednesday, 5pm Eastern
    try {
      const result = await askFrederick(
        "Where is happy hour near me right now?",
        { ...downtown, canShowDistance: true },
      );

      expect(result.usedModel).toBe(false);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(
        result.sources.every((source) =>
          /^On now · until /.test(source.status ?? ""),
        ),
      ).toBe(true);
      expect(result.sources.some((source) => source.name === "Orioles Nest 331")).toBe(false);
      expect(result.answer).toContain("confirmed happy hour");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not substitute a late-open bar when no happy hour is confirmed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    try {
      const result = await askFrederick(
        "Where is happy hour near me right now?",
        { ...downtown, canShowDistance: true },
      );

      expect(result.status).toBe("empty");
      expect(result.sources).toEqual([]);
      expect(result.answer).toContain(
        "I won’t substitute a bar just because it stays open late",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors a numbered date-night list with actual date-night records", async () => {
    const result = await askFrederick("three date-night restaurants downtown", downtown);
    expect(result.intent).toMatchObject({ kind: "place", audience: "date" });
    expect(result.plan).toBeUndefined();
    expect(result.sources).toHaveLength(3);
    expect(result.sources.map((source) => source.name)).toEqual([
      "Isabella's Taverna & Tapas Bar",
      "The Wine Kitchen on the Creek",
      "Hootch & Banter",
    ]);
  });

  it("does not recommend a retail-only tea shop as independent coffee", async () => {
    const result = await askFrederick("independent coffee near me", downtown);
    expect(result.sources.some((source) => source.name === "Voila in Frederick")).toBe(false);
    expect(result.answer).not.toContain("Voila in Frederick in Frederick");
  });

  it("keeps rainy-day family discovery focused on indoor places", async () => {
    const result = await askFrederick(
      "something indoors with kids because it is raining",
      downtown,
    );
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]?.name).toBe("The Little Pottery Shop");
    expect(result.sources.some((source) => source.name === "Hill Street Skate Park")).toBe(false);
    expect(result.sources.some((source) => /forecast|air quality/i.test(source.name))).toBe(false);
    expect(result.answer).not.toMatch(/National Weather Service forecast is/i);
  });

  it("answers air quality from AirNow or fails honestly without business-name noise", async () => {
    const result = await askFrederick("What is the air quality?", downtown);
    expect(result.usedModel).toBe(false);
    expect(result.sources.every((source) => source.slug === "airnow-aqi")).toBe(true);
    expect(result.sources.some((source) => /Airborne|Airbrush|Urban Air/i.test(source.name))).toBe(false);
    expect(result.answer).toMatch(/AirNow|fresh AirNow observation/);
    expect(result.actions?.[0]).toMatchObject({
      label: "Open air quality",
      href: "/pulse?open=air",
    });
  });

  it("treats an explicitly selected whole county as a valid planning scope", async () => {
    const result = await askFrederick("Plan an easy afternoon near me", {
      contextLabel: "Whole county",
      fallbackReason: null,
      canShowDistance: false,
    });
    expect(result.status).toBe("matches");
    expect(result.plan?.stops.length).toBeGreaterThanOrEqual(2);
    expect(result.context).toBe("Whole county");
    expect(result.answer).not.toContain("needs a real area");
  });
});
