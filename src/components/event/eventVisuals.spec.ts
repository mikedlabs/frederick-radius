import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventCardVisual, parseRecoveryEventVisual, planHorizonVisual } from "./eventVisuals";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "test-event",
    title: "Test event",
    description: "",
    starts_at: "2026-07-23T22:00:00.000Z",
    ends_at: "2026-07-24T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-07-23T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("eventCardVisual", () => {
  it("uses an exact Carroll Creek Linear Park match and labels it as venue photography", () => {
    expect(
      eventCardVisual(
        event({ venue_place_slug: "carroll-creek-linear-park-frederick" }),
      ),
    ).toEqual({
      src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
      caption: "Venue · Carroll Creek Linear Park",
      key: "radius-carroll-creek-summer",
      presentation: "photo",
    });
  });

  it("does not use a broad Carroll Creek aerial as an exact amphitheater image", () => {
    expect(
      eventCardVisual(
        event({ venue_place_slug: "carroll-creek-outdoor-amphitheater" }),
      ),
    ).toBeNull();
  });

  it("does not guess from a venue name or a nearby coordinate", () => {
    expect(
      eventCardVisual(
        event({
          venue_name: "Carroll Creek Outdoor Amphitheater",
          venue_place_slug: undefined,
        }),
      ),
    ).toBeNull();
  });

  it("credits allowlisted event-image providers", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "https://s1.ticketm.net/dam/a/example.jpg",
        }),
      ),
    ).toMatchObject({ caption: "Event image · Ticketmaster", presentation: "artwork" });

    expect(
      eventCardVisual(
        event({
          source: "seatgeek",
          hero_image: "https://seatgeek.com/images/example.jpg",
        }),
      ),
    ).toMatchObject({ caption: "Event image · SeatGeek", presentation: "artwork" });
  });

  it.each([
    [
      "dfp",
      "https://ik.imagekit.io/vibemap/events/example.jpg",
      "Event image · Downtown Frederick Partnership",
    ],
    [
      "visit-frederick",
      "https://assets.simpleviewinc.com/sv-frederick-county/image/fetch/example.jpg",
      "Event image · Visit Frederick",
    ],
    [
      "fcpl",
      "https://frederick.librarycalendar.com/sites/default/files/example.jpg",
      "Event image · Frederick County Public Libraries",
    ],
    [
      "mdcc",
      "https://static.wixstatic.com/media/6bde7e_opening.jpg",
      "Event image · Maryland Deaf Community Center",
    ],
  ] as const)(
    "accepts publisher event art from %s only on its exact host",
    (source, hero_image, caption) => {
      expect(
        eventCardVisual(
          event({
            source,
            source_url: "https://publisher.example/event",
            hero_image,
          }),
        ),
      ).toMatchObject({
        caption,
        sourceHref: "https://publisher.example/event",
        presentation: "artwork",
      });
    },
  );

  it("keeps publisher eligibility separate from shared transport hosts and source labels", () => {
    const library = "https://frederick.librarycalendar.com/sites/default/files/program.jpg";
    expect(eventCardVisual(event({ source: "ticketmaster", hero_image: library }))).toBeNull();
    expect(eventCardVisual(event({ source: "fcpl", hero_image: "https://s1.ticketm.net/dam/a/program.jpg" }))).toBeNull();
    expect(eventCardVisual(event({ source: "fcpl", hero_image: library })))
      .toMatchObject({ caption: "Event image · Frederick County Public Libraries", presentation: "artwork" });
  });

  it("presents only source/account-bound Steinhardt art as publisher artwork", () => {
    const input = event({ source: "venue-extract", source_url: "https://www.steinhardtbrewing.com/live-music-events",
      venue_place_slug: "steinhardt-brewing-company-frederick", hero_image: fixture.upcoming[0].assetUrl });
    expect(eventCardVisual(input)).toMatchObject({ src: fixture.upcoming[0].assetUrl,
      caption: "Event image · Steinhardt Brewing Company", presentation: "artwork", sourceHref: input.source_url });
    expect(eventCardVisual({ ...input, source: "ticketmaster" })).toBeNull();
    expect(eventCardVisual({ ...input, venue_place_slug: "rockwell-brewery-frederick" })).toBeNull();
    expect(eventCardVisual({ ...input, source_url: "https://www.rockwellbrewery.com/events" })).toBeNull();
    expect(eventCardVisual({ ...input, source_url: null })).toBeNull();
    expect(eventCardVisual({ ...input, source_url: "" })).toBeNull();
  });

  it("rejects a source-approved event with an image on the wrong host", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "https://example.com/not-ticketmaster.jpg",
        }),
      ),
    ).toBeNull();
  });

  it.each([
    "http://static.wixstatic.com/media/6bde7e_opening.jpg",
    "https://static.wixstatic.com:444/media/6bde7e_opening.jpg",
    "https://static.wixstatic.com/not-media/6bde7e_opening.jpg",
    "https://images.wixstatic.com/media/6bde7e_opening.jpg",
  ])("rejects an MDCC image outside its exact Wix HTTPS media policy", (hero_image) => {
    expect(
      eventCardVisual(
        event({
          source: "mdcc",
          hero_image,
        }),
      ),
    ).toBeNull();
  });

  it("does not promote an unattributed place-photo proxy", () => {
    expect(
      eventCardVisual(
        event({
          source: "ticketmaster",
          hero_image: "/api/place-photo?name=unattributed",
        }),
      ),
    ).toBeNull();
  });

  it("promotes a venue photo only when it carries its direct source credit", () => {
    const attribution = {
      kind: "venue" as const,
      venue_name: "Test Venue",
      provider: "google_maps" as const,
      source_uri: "https://www.google.com/maps/place/example-photo",
      authors: [
        {
          display_name: "Local photographer",
          uri: "https://maps.google.com/maps/contrib/123",
        },
      ],
    };
    expect(
      eventCardVisual(
        event({
          hero_image: "/api/place-photo?name=credited",
          hero_image_attribution: attribution,
        }),
      ),
    ).toEqual({
      src: "/api/place-photo?name=credited",
      caption: "Venue · Test Venue",
      key: "venue:/api/place-photo?name=credited",
      presentation: "photo",
      attribution,
    });
  });
});

describe("planHorizonVisual", () => {
  it("keeps a visual lead and does not promote a second image", () => {
    const lead = event({
      slug: "lead",
      venue_place_slug: "carroll-creek-linear-park-frederick",
    });
    const rest = [
      event({ slug: "second", venue_place_slug: "baker-park-frederick" }),
    ];

    const plan = planHorizonVisual(lead, rest);
    expect(plan.leadVisual?.key).toBe("radius-carroll-creek-summer");
    expect(plan.promotedIndex).toBe(-1);
    expect(plan.promotedVisual).toBeNull();
  });

  it("promotes the first safe visual at its existing chronological index", () => {
    const lead = event({ slug: "lead" });
    const rest = [
      event({ slug: "second" }),
      event({ slug: "third", venue_place_slug: "baker-park-frederick" }),
      event({
        slug: "fourth",
        venue_place_slug: "carroll-creek-linear-park-frederick",
      }),
    ];

    const plan = planHorizonVisual(lead, rest);
    expect(plan.leadVisual).toBeNull();
    expect(plan.promotedIndex).toBe(1);
    expect(rest[plan.promotedIndex].slug).toBe("third");
    expect(plan.promotedVisual?.key).toBe("radius-baker-park-bandshell");
  });
});


describe("recovery event visual boundary", () => {
  const sourceHref = "https://publisher.example/events/community-concert";
  const attribution = {
    kind: "venue" as const,
    venue_name: "Test Venue",
    provider: "google_maps" as const,
    source_uri: "https://www.google.com/maps/place/example-photo",
    authors: [{ display_name: "Supplied photographer" }],
  };

  function ownedVisual() {
    const visual = eventCardVisual(event({ venue_place_slug: "baker-park-bandshell" }));
    expect(visual).not.toBeNull();
    return visual!;
  }

  function publisherVisual() {
    const visual = eventCardVisual(event({
      source: "fcpl", source_url: sourceHref,
      hero_image: "https://frederick.librarycalendar.com/sites/default/files/program.jpg",
    }));
    expect(visual).not.toBeNull();
    return visual!;
  }

  it.each([
    "carroll-creek-linear-park-frederick",
    "baker-park-frederick",
    "baker-park-bandshell",
  ])("round-trips the exact registered owned visual for %s as a fresh known-field record", venue_place_slug => {
    const visual = eventCardVisual(event({ venue_place_slug }))!;
    const packet = Object.freeze({ ...visual, unexpected: { doNotPublish: true } });
    const parsed = parseRecoveryEventVisual(packet);
    expect(parsed).toEqual(visual);
    expect(parsed).not.toBe(packet);
    expect(parsed).not.toHaveProperty("unexpected");
    expect(parsed).not.toHaveProperty("sourceHref");
    expect(parsed).not.toHaveProperty("attribution");
    expect(packet.unexpected).toEqual({ doNotPublish: true });
  });

  it.each([
    ["dfp", "https://ik.imagekit.io/vibemap/events/program.jpg", "Event image · Downtown Frederick Partnership"],
    ["visit-frederick", "https://assets.simpleviewinc.com/sv-frederick-county/image/fetch/program.jpg", "Event image · Visit Frederick"],
    ["fcpl", "https://frederick.librarycalendar.com/sites/default/files/program.jpg", "Event image · Frederick County Public Libraries"],
    ["mdcc", "https://static.wixstatic.com/media/program.jpg", "Event image · Maryland Deaf Community Center"],
    ["ticketmaster", "https://s1.ticketm.net/dam/a/program.jpg", "Event image · Ticketmaster"],
    ["seatgeek", "https://seatgeek.com/images/program.jpg", "Event image · SeatGeek"],
  ] as const)("retains %s source wording, source link and intact-art presentation", (source, hero_image, caption) => {
    const approved = eventCardVisual(event({ source, source_url: sourceHref, hero_image }))!;
    const packet = Object.freeze({ ...approved, discarded: "not part of the public visual" });
    const parsed = parseRecoveryEventVisual(packet);
    expect(parsed).toEqual({ src: hero_image, key: `event:${hero_image}`, caption, presentation: "artwork", sourceHref });
    expect(parsed).not.toBe(packet);
    expect(parsed).not.toHaveProperty("discarded");
  });

  it("retains only the reviewed Steinhardt collection and image account", () => {
    const source_url = "https://www.steinhardtbrewing.com/live-music-events";
    const approved = eventCardVisual(event({ source: "venue-extract", source_url,
      venue_place_slug: "steinhardt-brewing-company-frederick", hero_image: fixture.upcoming[0].assetUrl }))!;
    expect(parseRecoveryEventVisual(approved)).toEqual(approved);
    expect(parseRecoveryEventVisual({ ...approved, sourceHref: "https://www.steinhardtbrewing.com/another-collection" })).toBeNull();
    const wrongAccount = approved.src.replace("/5f9ef850cc5c2c1189e6fb4a/", "/unreviewed-account/");
    expect(wrongAccount).not.toBe(approved.src);
    expect(parseRecoveryEventVisual({ ...approved, src: wrongAccount, key: `event:${wrongAccount}` })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, sourceHref: "https://www.rockwellbrewery.com/events" })).toBeNull();
  });

  it.each([
    ["unregistered local photo", { src: "/images/unreviewed-event.jpg" }],
    ["changed subject caption", { caption: "Venue · Another place" }],
    ["changed source identity", { key: "another-photo" }],
    ["changed photo classification", { presentation: "artwork" }],
    ["invented external source credit", { sourceHref }],
    ["injected Google attribution", { attribution }],
  ] as const)("rejects an owned descriptor with %s", (_label, patch) => {
    expect(parseRecoveryEventVisual({ ...ownedVisual(), ...patch })).toBeNull();
  });

  it.each([
    ["missing source link", undefined],
    ["HTTP source link", "http://publisher.example/events/program"],
    ["script source link", "javascript:alert(1)"],
    ["source credentials", "https://user:password@publisher.example/events/program"],
    ["source port override", "https://publisher.example:444/events/program"],
  ] as const)("rejects publisher art without usable source credit: %s", (_label, sourceHref) => {
    expect(parseRecoveryEventVisual({ ...publisherVisual(), sourceHref })).toBeNull();
  });

  it.each([
    ["changed publisher label", { caption: "Event image · Ticketmaster" }],
    ["photo crop relabel", { presentation: "photo" }],
    ["changed source identity", { key: "another-image" }],
    ["Google attribution injected into publisher art", { attribution }],
    ["malformed source", { src: 42 }],
    ["malformed key", { key: null }],
    ["malformed caption", { caption: [] }],
  ] as const)("rejects %s in a publisher descriptor", (_label, patch) => {
    expect(parseRecoveryEventVisual({ ...publisherVisual(), ...patch })).toBeNull();
  });

  it.each([
    "/api/place-photo?name=not-for-recovery",
    "https://frederickradius.app/api/place-photo?name=not-for-recovery",
    "https://places.googleapis.com/v1/places/example/photos/example/media",
    "https://lh3.googleusercontent.com/example-photo",
    "/_next/image?url=%2Fapi%2Fplace-photo%3Fname%3Dhidden&w=384&q=75",
    "https://frederickradius.app/_next/image?url=https%3A%2F%2Flh3.googleusercontent.com%2Fphoto&w=384&q=75",
    "//frederick.librarycalendar.com/sites/default/files/program.jpg",
    "http://frederick.librarycalendar.com/sites/default/files/program.jpg",
    "https://frederick.librarycalendar.com.evil.example/sites/default/files/program.jpg",
    "https://user:password@frederick.librarycalendar.com/sites/default/files/program.jpg",
    "https://frederick.librarycalendar.com:444/sites/default/files/program.jpg",
    "https://frederick.librarycalendar.com/unreviewed-account/program.jpg",
    "data:image/png;base64,AA==",
    "blob:https://frederickradius.app/unreviewed",
  ])("does not accept unsafe or unapproved recovery media %s", src => {
    expect(parseRecoveryEventVisual({ ...publisherVisual(), src, key: `event:${src}` })).toBeNull();
  });

  it.each([
    ["dfp", "https://ik.imagekit.io/another-account/program.jpg"],
    ["visit-frederick", "https://assets.simpleviewinc.com/another-county/image/fetch/program.jpg"],
    ["fcpl", "https://frederick.librarycalendar.com/another-path/program.jpg"],
  ] as const)("does not mint %s recovery art outside the existing optimizer account path", (source, hero_image) => {
    expect(eventCardVisual(event({ source, hero_image, source_url: sourceHref }))).toBeNull();
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "null", value: null },
    { label: "array", value: [] },
    { label: "number", value: 42 },
    { label: "raw string", value: "raw-image-url" },
  ])("treats a malformed optional visual as absent: $label", ({ value }) => {
    expect(parseRecoveryEventVisual(value)).toBeNull();
  });

  it("keeps existing credited Google behavior by default but excludes it from owned-only recovery", () => {
    const input = event({ hero_image: "/api/place-photo?name=credited", hero_image_attribution: attribution });
    const normal = eventCardVisual(input);
    expect(normal).toMatchObject({ src: input.hero_image, attribution });
    expect(eventCardVisual(input, { venuePhotos: "owned-only" })).toBeNull();
    expect(parseRecoveryEventVisual(normal)).toBeNull();
    expect(input.hero_image_attribution).toBe(attribution);
  });

  it("keeps exact owned fallback and publisher priority when Google venue photos are excluded", () => {
    const input = event({ hero_image: "/api/place-photo?name=credited", hero_image_attribution: attribution,
      venue_place_slug: "baker-park-bandshell" });
    expect(eventCardVisual(input)?.attribution).toBe(attribution);
    expect(eventCardVisual(input, { venuePhotos: "owned-only" })).toEqual(ownedVisual());
    const published = event({ source: "fcpl", source_url: sourceHref,
      hero_image: "https://frederick.librarycalendar.com/sites/default/files/program.jpg",
      venue_place_slug: "baker-park-bandshell" });
    expect(eventCardVisual(published, { venuePhotos: "owned-only" })).toEqual(eventCardVisual(published));
    expect(eventCardVisual(published, { venuePhotos: "owned-only" })?.presentation).toBe("artwork");
  });
});
