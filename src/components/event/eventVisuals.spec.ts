import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventCardVisual, parseRecoveryEventVisual, planHorizonVisual } from "./eventVisuals";
import fixture from "../../../tests/fixtures/steinhardt-squarespace.json" with { type: "json" };
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

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
  it.each([
    ["carroll-creek-linear-park-frederick", "Carroll Creek Linear Park", "radius-carroll-creek-summer"],
    ["baker-park-frederick", "Baker Park", "radius-baker-park-bandshell"],
    ["baker-park-bandshell", "Baker Park Bandshell", "radius-baker-park-bandshell"],
  ])("uses the registered %s primary with its stable legacy venue label and key", (venue_place_slug, venue, key) => {
    const photo = getOwnedPlacePhoto(venue_place_slug);
    expect(photo).not.toBeNull();
    expect(eventCardVisual(event({ venue_place_slug }))).toEqual({
      src: photo!.src,
      caption: `Venue · ${venue}`,
      key,
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

describe("exact licensed event venue photographs", () => {
  it("retains museum entrance framing and rejects a changed crop in a recovery tuple", () => {
    const visual = eventCardVisual(event({ venue_place_slug: "national-museum-civil-war-medicine-frederick" }))!;
    expect(visual).toMatchObject({ objectPosition: "bottom", caption: "Venue · National Museum of Civil War Medicine exterior",
      licensedCredit: { creator: "NatMuseCivMed", license: { label: "CC BY-SA 4.0" } } });
    expect(parseRecoveryEventVisual(visual)).toEqual(visual);
    expect(parseRecoveryEventVisual({ ...visual, objectPosition: "center" })).toBeNull();
  });

  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS))("retains the complete local credit for %s without a paid fallback", (venue_place_slug, photo) => {
    const visual = eventCardVisual(event({ venue_place_slug,
      hero_image: "/api/place-photo?name=unused-google&w=800" }), { venuePhotos: "free-reviewed" })!;
    expect(visual).toMatchObject({ src: photo.image.src, presentation: "photo", key: `licensed-venue:${venue_place_slug}`,
      licensedCredit: { creator: photo.image.creator, source_url: photo.image.source_url,
        license: photo.image.license, modifications: photo.image.modifications } });
    expect(visual.attribution).toBeUndefined();
    expect(eventCardVisual(event({ venue_place_slug }))).toEqual(visual);
    expect(eventCardVisual(event({ venue_place_slug }), { venuePhotos: "owned-only" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, ignored: "drop" })).toEqual(visual);
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: undefined })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: { ...visual.licensedCredit, creator: "Wrong creator" } })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: { ...visual.licensedCredit, modifications: "Unchanged" } })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: { ...visual.licensedCredit, license: { label: "Public domain", url: "https://example.test" } } })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, sourceHref: "https://example.test" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, src: "/history-photos/wrong-venue.jpg" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, caption: "Photograph of this event" })).toBeNull();
  });

  it("keeps Brewer's Alley archival context and its original source visible in the tuple", () => {
    const visual = eventCardVisual(event({ venue_place_slug: "brewers-alley-frederick" }))!;
    expect(visual.caption).toBe("Venue · Brewer's Alley side entrance, photographed in 2004");
    expect(visual.licensedCredit?.original_source_url).toBe(CREDITED_LOCAL_PLACE_PHOTOS["brewers-alley-frederick"].provenance.original_source_url);
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: { ...visual.licensedCredit, original_source_url: undefined } })).toBeNull();
  });

  it("keeps approved publisher imagery ahead of the licensed venue and rejects venue aliases", () => {
    expect(eventCardVisual(event({ source: "ticketmaster", hero_image: "https://s1.ticketm.net/dam/a/approved.jpg",
      venue_place_slug: "brewers-alley-frederick" }))?.presentation).toBe("artwork");
    for (const venue_place_slug of ["brewers-alley", "schifferstadt", "__proto__"]) {
      expect(eventCardVisual(event({ venue_place_slug }), { venuePhotos: "free-reviewed" })).toBeNull();
    }
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
    ["carroll-creek-linear-park-frederick", "/images/seasons/summer/SUMMER CARROL CREEK.jpg"],
    ["baker-park-frederick", "/images/seasons/fall/018.jpg"],
    ["baker-park-bandshell", getOwnedPlacePhoto("baker-park-frederick")!.src],
  ])("rejects a stale or different-place source in the legacy %s recovery tuple", (venue_place_slug, wrongSrc) => {
    const visual = eventCardVisual(event({ venue_place_slug }))!;
    expect(visual.src).not.toBe(wrongSrc);
    expect(parseRecoveryEventVisual(visual)).toEqual(visual);
    expect(parseRecoveryEventVisual({ ...visual, src: wrongSrc })).toBeNull();
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


describe("exact owned event venue photographs", () => {
  const fairgrounds = "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick";
  const suppliedGoogle = {
    hero_image: "/api/place-photo?name=supplied-existing-venue&w=800",
    hero_image_attribution: {
      kind: "venue" as const,
      venue_name: "Supplied venue",
      provider: "google_maps" as const,
      source_uri: "https://www.google.com/maps/place/supplied-existing-venue",
      authors: [{ display_name: "Supplied photographer" }],
    },
  };

  it.each([
    [fairgrounds, "/images/fair/fairgrounds-night-mike-d-1920.jpg", "Frederick Fairgrounds during The Great Frederick Fair", "right"],
    ["mccurdy-field", "/images/seasons/spring/aerial-view-baseball-field.jpg", "McCurdy Field", "center"],
    ["visitation-hotel", getOwnedPlacePhoto("visitation-hotel")!.src, "Visitation Hotel", "right"],
  ] as const)("prefers the exact owned venue over already-eligible Google media for %s", (venue_place_slug, src, venue, objectPosition) => {
    const input = event({ ...suppliedGoogle, venue_place_slug });
    const normal = eventCardVisual(input);
    expect(normal).toEqual({ src, caption: `Venue · ${venue}`, key: `owned-venue:${venue_place_slug}`,
      presentation: "photo", objectPosition });
    expect(eventCardVisual(input, { venuePhotos: "owned-only" })).toEqual(normal);
    expect(normal?.src).not.toContain("/api/place-photo");
    expect(normal).not.toHaveProperty("attribution");
    expect(normal).not.toHaveProperty("sourceHref");
    expect(input.hero_image).toBe(suppliedGoogle.hero_image);
    expect(input.hero_image_attribution).toBe(suppliedGoogle.hero_image_attribution);
  });

  it.each([fairgrounds, "visitation-hotel"])("retains event-specific publisher artwork ahead of %s without photo framing", venue_place_slug => {
    const approved = eventCardVisual(event({ venue_place_slug, source: "ticketmaster",
      source_url: "https://www.ticketmaster.com/offline-fixture", hero_image: "https://s1.ticketm.net/dam/a/offline-fixture.jpg" }));
    expect(approved).toMatchObject({ src: "https://s1.ticketm.net/dam/a/offline-fixture.jpg",
      caption: "Event image · Ticketmaster", presentation: "artwork" });
    expect(approved).not.toHaveProperty("objectPosition");
    expect(approved).not.toHaveProperty("attribution");
  });

  it.each(["frederick-fairgrounds", "fairgrounds", "mcclintocks-back-bar", "brewers-alley-frederick", "__proto__"])(
    "does not invent an owned or licensed venue mapping for %s", venue_place_slug => {
      expect(eventCardVisual(event({ venue_place_slug, venue_name: "Frederick Fairgrounds" }),
        { venuePhotos: "owned-only" })).toBeNull();
    });

  it("never infers a photo from the Fairgrounds name without the exact canonical slug", () => {
    expect(eventCardVisual(event({ venue_name: "Frederick Fairgrounds", venue_place_slug: undefined }),
      { venuePhotos: "owned-only" })).toBeNull();
  });

  it.each([undefined, "visitation", "Visitation-Hotel", "visitation-hotel-reception", "wye-oak-tavern-frederick"])(
    "does not infer Visitation imagery from a name, nearby business or alias %s", venue_place_slug => {
      expect(eventCardVisual(event({ venue_place_slug, venue_name: "Visitation Hotel" }),
        { venuePhotos: "owned-only" })).toBeNull();
    });

  it("keeps legacy Baker Park Google precedence and its owned-only fallback unchanged", () => {
    const input = event({ ...suppliedGoogle, venue_place_slug: "baker-park-bandshell" });
    expect(eventCardVisual(input)?.attribution).toBe(suppliedGoogle.hero_image_attribution);
    expect(eventCardVisual(input, { venuePhotos: "owned-only" })).toEqual({
      src: "/images/seasons/fall/018.jpg", caption: "Venue · Baker Park Bandshell",
      key: "radius-baker-park-bandshell", presentation: "photo",
    });
  });

  it.each([fairgrounds, "mccurdy-field", "visitation-hotel"])("round-trips %s through recovery using its exact canonical framing", venue_place_slug => {
    const approved = eventCardVisual(event({ venue_place_slug }), { venuePhotos: "owned-only" })!;
    const packet = Object.freeze({ ...approved, ignored: "not part of the visual contract" });
    const parsed = parseRecoveryEventVisual(packet);
    expect(parsed).toEqual(approved);
    expect(parsed).not.toBe(packet);
    expect(parsed).not.toHaveProperty("ignored");
    expect(parsed).not.toHaveProperty("attribution");
    expect(parseRecoveryEventVisual({ ...approved, objectPosition: undefined })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, objectPosition: approved.objectPosition === "right" ? "center" : "right" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, objectPosition: "left" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, caption: "Event image · current performance" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, sourceHref: "https://example.test/not-this-photo" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...approved, src: "/api/place-photo?name=unapproved" })).toBeNull();
  });

  it.each([
    "/images/seasons/fall/018.jpg",
    "/images/places/unreviewed-hotel.jpg",
    "https://example.test/images/places/visitation-hotel-sunset.jpg",
    "//example.test/images/places/visitation-hotel-sunset.jpg",
  ])("rejects unregistered or substituted Visitation recovery bytes %s", src => {
    const visual = eventCardVisual(event({ venue_place_slug: "visitation-hotel" }))!;
    expect(parseRecoveryEventVisual({ ...visual, src })).toBeNull();
  });

  it("cannot relabel an owned hotel as another venue or inherit an unrelated image license", () => {
    const visual = eventCardVisual(event({ venue_place_slug: "visitation-hotel" }))!;
    const licensed = eventCardVisual(event({ venue_place_slug: "weinberg-center-for-the-arts-frederick" }))!;
    expect(licensed.licensedCredit).toBeDefined();
    expect(parseRecoveryEventVisual({ ...visual, caption: "Venue · Wye Oak Tavern" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, key: "owned-venue:wye-oak-tavern-frederick" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...visual, licensedCredit: licensed.licensedCredit })).toBeNull();
  });

  it("does not let a recovery packet add owned framing to publisher art or a legacy venue tuple", () => {
    const published = eventCardVisual(event({ source: "ticketmaster", source_url: "https://www.ticketmaster.com/offline-fixture",
      hero_image: "https://s1.ticketm.net/dam/a/offline-fixture.jpg" }))!;
    const legacy = eventCardVisual(event({ venue_place_slug: "baker-park-bandshell" }))!;
    expect(parseRecoveryEventVisual({ ...published, objectPosition: "right" })).toBeNull();
    expect(parseRecoveryEventVisual({ ...legacy, objectPosition: "center" })).toBeNull();
  });

  it("keeps the selected lead rather than promoting a later publisher image", () => {
    const lead = event({ slug: "selected-owned-venue", venue_place_slug: fairgrounds });
    const later = event({ slug: "later-publisher-art", source: "ticketmaster",
      hero_image: "https://s1.ticketm.net/dam/a/later-fixture.jpg" });
    const rest = Object.freeze([later]);
    expect(planHorizonVisual(lead, rest)).toEqual({ leadVisual: eventCardVisual(lead), promotedIndex: -1, promotedVisual: null });
    expect(rest[0]).toBe(later);
  });
});
