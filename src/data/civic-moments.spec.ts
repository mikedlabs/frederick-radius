import path from "node:path";
import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { eventHasPreciseLocation } from "@/lib/events/geo-confidence";
import { getTownPhoto } from "@/lib/integrations/wikimedia";
import { getEventBySlug } from "@/lib/loaders/events";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { CIVIC_MOMENTS, activeMoment, momentBySlug, momentForEventSlug } from "./civic-moments";
import { EVENT_BY_SLUG } from "./events";

const COLORFEST = "catoctin-colorfest-2026";
const COLORFEST_EVENT = "catoctin-colorfest-thurmont-2026";
const COLORFEST_PLAN = "https://colorfest.org/plan-your-visit/";

describe("activeMoment", () => {
  it("returns the Fourth during its Eastern window", () => {
    // 2026-07-03 ~10am ET (14:00Z) — inside July 1..5.
    const m = activeMoment(new Date("2026-07-03T14:00:00Z"));
    expect(m?.slug).toBe("fourth-of-july-2026");
  });

  it("shows through the end of the last day (Eastern), then retires", () => {
    // 2026-07-05 23:30 ET = 2026-07-06T03:30Z — still the 5th in Eastern.
    expect(activeMoment(new Date("2026-07-06T03:30:00Z"))?.slug).toBe("fourth-of-july-2026");
    // 2026-07-06 08:00 ET — window over.
    expect(activeMoment(new Date("2026-07-06T12:00:00Z"))).toBeNull();
  });

  it("is null well outside any window", () => {
    expect(activeMoment(new Date("2026-08-15T14:00:00Z"))).toBeNull();
  });

  it("shows Colorfest from Thursday Oct 8 through Sunday Oct 11, Eastern", () => {
    // Wed Oct 7, 11:30 PM ET: not yet.
    expect(activeMoment(new Date("2026-10-08T03:30:00Z"))).toBeNull();
    // Thu Oct 8, 12:30 AM ET: the spotlight opens.
    expect(activeMoment(new Date("2026-10-08T04:30:00Z"))?.slug).toBe(COLORFEST);
    // Sun Oct 11, 11:30 PM ET: still the last day.
    expect(activeMoment(new Date("2026-10-12T03:30:00Z"))?.slug).toBe(COLORFEST);
    // Mon Oct 12, 8 AM ET: retired.
    expect(activeMoment(new Date("2026-10-12T12:00:00Z"))).toBeNull();
  });
});

describe("momentForEventSlug", () => {
  it("finds the guide for an event it covers", () => {
    expect(momentForEventSlug(COLORFEST_EVENT)?.slug).toBe(COLORFEST);
  });

  it("returns null for an event without a guide", () => {
    expect(momentForEventSlug("frederick-festival-of-the-arts-2026")).toBeNull();
    expect(momentForEventSlug("no-such-event")).toBeNull();
    expect(momentForEventSlug("")).toBeNull();
  });
});

describe("Catoctin Colorfest", () => {
  const colorfest = momentBySlug(COLORFEST)!;

  it("carries only sourced dates and admission as its facts", () => {
    expect(colorfest.spotlightFacts).toEqual([
      {
        label: "Dates",
        value: "Sat Oct 10 and Sun Oct 11",
        source_url: "https://www.thurmont.com/2236/Colorfest",
      },
      { label: "Admission", value: "Free", source_url: COLORFEST_PLAN },
    ]);
    expect(colorfest.days).toEqual([{ date: "2026-10-10" }, { date: "2026-10-11" }]);
  });

  it("cites the organizer's page on every hours, parking and shuttle item", () => {
    const items = colorfest.sections.flatMap((s) => s.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.source_url).toBe(COLORFEST_PLAN);
      expect(item.confidence).toBe("confirmed");
    }
    expect(colorfest.venue?.source_url).toBe(COLORFEST_PLAN);
  });

  it("uses the licensed Thurmont town photo, which is credited and verified", () => {
    expect(colorfest.spotlightImage).toBeUndefined();
    expect(colorfest.heroPhoto).toEqual({
      townSlug: "thurmont",
      depicts: "Thurmont Town Square Park, the town center",
    });
    expect(getTownPhoto("thurmont")).toMatchObject({
      author: "CraigShipp.com Photos",
      license: "CC BY-SA 2.0",
      verified: true,
    });
  });

  it("places the guide and the event at the catalog's Community Park record", () => {
    const park = clientPlaceBySlug("thurmont-community-park-thurmont");
    expect(park?.address).toBe("19 Frederick Rd, Thurmont, MD 21788");
    expect(colorfest.venue).toMatchObject({
      placeSlug: "thurmont-community-park-thurmont",
      lng: park?.geom.lng,
      lat: park?.geom.lat,
      address: park?.address,
    });

    const seed = EVENT_BY_SLUG[COLORFEST_EVENT];
    expect(seed).toMatchObject({
      venue_place_slug: "thurmont-community-park-thurmont",
      address: "19 Frederick Rd, Thurmont, MD 21788",
      geom: { lng: -77.4127594, lat: 39.6213 },
      source_url: "https://www.thurmont.com/2236/Colorfest",
    });
  });

  it("gives the Colorfest event a precise location, so its page draws a map", () => {
    const event = getEventBySlug(COLORFEST_EVENT);
    expect(event).not.toBeNull();
    const venue = clientPlaceBySlug(event!.venue_place_slug!);
    expect(venue).toBeDefined();
    expect(eventHasPreciseLocation(event!, Boolean(venue))).toBe(true);
  });
});

describe("momentBySlug", () => {
  it("finds a moment and 404s an unknown one", () => {
    expect(momentBySlug("fourth-of-july-2026")?.title).toContain("Fourth");
    expect(momentBySlug("nope")).toBeNull();
  });

  it("keeps the Fair's independent-guide boundary in its public data", () => {
    expect(momentBySlug("great-frederick-fair-2026")?.disclosure).toBe(
      "Radius is an independent local guide. Fair details come from official Fair sources linked below.",
    );
  });

  it("keeps the owned In The Streets photograph descriptive and correctly sized", () => {
    const streets = momentBySlug("in-the-street-2026");
    expect(streets?.spotlightImage).toEqual({
      src: "/images/moments/in-the-streets-2024-mike-d.jpg",
      alt: "A crowd on Market Street during In The Streets in downtown Frederick.",
      credit: "",
      width: 1920,
      height: 1078,
    });
    expect(streets?.spotlightDirectionsUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Market%20Street%2C%20Frederick%2C%20MD",
    );
  });

  it("ships the In The Streets image without private capture metadata", async () => {
    const metadata = await sharp(
      path.join(process.cwd(), "public/images/moments/in-the-streets-2024-mike-d.jpg"),
    ).metadata();

    expect([metadata.width, metadata.height]).toEqual([1920, 1078]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("puts the In The Streets day in chronological order", () => {
    const timeline = momentBySlug("in-the-street-2026")?.sections.find(
      (section) => section.heading === "Today's timeline",
    );

    expect(timeline?.items.map((item) => item.title)).toEqual([
      "Market Street Mile",
      "In The Streets festival",
      "Craft Beverage Experience",
      "Up The Creek party",
    ]);
  });
});

describe("data integrity (a bad hand-edit fails here)", () => {
  it("every moment has a sane window and required fields", () => {
    for (const m of CIVIC_MOMENTS) {
      expect(m.slug).toMatch(/^[a-z0-9-]+$/);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.spotlightLead.length).toBeGreaterThan(0);
      expect(m.starts <= m.ends).toBe(true);
      expect(m.sections.length).toBeGreaterThan(0);
      for (const fact of m.spotlightFacts ?? []) {
        expect(fact.label.trim().length).toBeGreaterThan(0);
        expect(fact.value.trim().length).toBeGreaterThan(0);
      }
      if (m.spotlightImage) {
        expect(m.spotlightImage.src).toMatch(/^\/images\/moments\/.+\.(?:jpg|jpeg|webp)$/);
        expect(m.spotlightImage.alt.trim().length).toBeGreaterThan(0);
        if (m.spotlightImage.src === "/images/moments/in-the-streets-2024-mike-d.jpg") {
          expect(m.spotlightImage.credit).toBe("");
        } else {
          expect(m.spotlightImage.credit.trim().length).toBeGreaterThan(0);
        }
        expect(m.spotlightImage.width).toBeGreaterThan(0);
        expect(m.spotlightImage.height).toBeGreaterThan(0);
      }
      if (m.spotlightSourceUrl) {
        expect(m.spotlightSourceUrl).toMatch(/^https?:\/\//);
      }
      if (m.spotlightDirectionsUrl) {
        expect(m.spotlightDirectionsUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it("every item is well-formed; sourced items use http and valid confidence", () => {
    for (const m of CIVIC_MOMENTS) {
      for (const s of m.sections) {
        for (const it of s.items) {
          expect(it.title.length).toBeGreaterThan(0);
          expect(["fireworks", "parade", "activity", "closure", "tip"]).toContain(it.kind);
          if (it.source_url) expect(it.source_url).toMatch(/^https?:\/\//);
          if (it.confidence) expect(["confirmed", "pattern"]).toContain(it.confidence);
        }
      }
    }
  });

  it("every hero photo, venue, day and event link resolves to real data", () => {
    for (const m of CIVIC_MOMENTS) {
      for (const fact of m.spotlightFacts ?? []) {
        if (fact.source_url) expect(fact.source_url).toMatch(/^https:\/\//);
      }
      if (m.heroPhoto) {
        expect(getTownPhoto(m.heroPhoto.townSlug), m.slug).not.toBeNull();
        expect(m.heroPhoto.depicts.trim().length).toBeGreaterThan(0);
      }
      if (m.venue) {
        const place = clientPlaceBySlug(m.venue.placeSlug);
        expect(place, `${m.slug} venue`).toBeDefined();
        expect(m.venue.lng).toBeCloseTo(place!.geom.lng, 5);
        expect(m.venue.lat).toBeCloseTo(place!.geom.lat, 5);
        // An arrival caveat is a claim, so it names its source.
        if (m.venue.note) expect(m.venue.source_url).toMatch(/^https:\/\//);
        // The guide's filled action and the event page link jump to this
        // section, so it must be a real heading on the same guide.
        if (m.venue.arrivalSection) {
          expect(
            m.sections.map((section) => section.heading),
            `${m.slug} arrivalSection`,
          ).toContain(m.venue.arrivalSection);
        }
      }
      for (const day of m.days ?? []) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(m.starts <= day.date && day.date <= m.ends, `${m.slug} ${day.date}`).toBe(true);
      }
      for (const eventSlug of m.eventSlugs ?? []) {
        const event = EVENT_BY_SLUG[eventSlug];
        expect(event, `${m.slug} → ${eventSlug}`).toBeDefined();
        if (m.venue) expect(event.venue_place_slug).toBe(m.venue.placeSlug);
      }
    }
  });

  it("every FAQ entry is a well-formed question and answer", () => {
    for (const m of CIVIC_MOMENTS) {
      for (const f of m.faq ?? []) {
        expect(f.q.trim().length).toBeGreaterThan(0);
        expect(f.q.trim().endsWith("?")).toBe(true);
        expect(f.a.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("no em dashes in any user-facing moment copy", () => {
    const blob = JSON.stringify(CIVIC_MOMENTS);
    expect(blob).not.toContain("—");
  });
});
