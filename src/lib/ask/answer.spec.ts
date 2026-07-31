import { describe, expect, it, vi } from "vitest";
import { askFrederick, sourceHasVerifiedOpenStatus } from "./answer";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { haversineMeters } from "@/lib/geo";

const downtown = {
  origin: { lng: -77.4105, lat: 39.4143 },
  municipality: "frederick",
  contextLabel: "your location",
} as const;

describe("askFrederick structured answers", () => {
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
    expect(result.sources[0]).toMatchObject({
      name: "Brunswick · Town Hall",
      href: "https://brunswickmd.gov/publicworks",
      phone: "301-834-7500",
    });
    expect(result.answer).toContain("instead of guessing");
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
    expect(result.answer).toContain("does not have live truck locations yet");
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
    expect(result.sources.every((source) => source.category === "music")).toBe(true);
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
    vi.setSystemTime(new Date("2026-07-29T21:00:00.000Z"));
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
