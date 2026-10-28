import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// One explicit test-only source approval preserves the existing deferred-byte
// transport contract. The production current-appearance review list is empty.
vi.mock("@/lib/today/place-photo-appearance", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/today/place-photo-appearance")>();
  const asOf = new Date("2026-10-26T16:00:00.000Z");
  const reviews = [{ slug: "gravel-and-grind", src: "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=720&fallback=signal",
    appearance: "current" as const, reviewedOn: "2026-10-26", validUntil: "2026-10-31", evidence: "Offline deferred-byte fixture only, not business appearance evidence." }];
  return { ...actual,
    hasTodayPhotoAppearanceReview: (slug: string, src: string | null) => actual.hasTodayPhotoAppearanceReview(slug, src, reviews, asOf),
    todayAppearancePhotoPlan: (slug: string, plan: Parameters<typeof actual.todayAppearancePhotoPlan>[1]) => actual.todayAppearancePhotoPlan(slug, plan, reviews, asOf),
  };
});
import DaypartNeeds, {
  DaypartEmptyState,
  daypartBrowseHref,
  daypartEmptyCopy,
  daypartLeadReason,
  daypartPhotoSrc,
  daypartPickScopeLabel,
  daypartShelfHeading,
  daypartShelfTier,
  daypartUsablePickCount,
  initialDaypartCategory,
  isPhotoFailureSignal,
  isDaypartCountywideContext,
  liveShelfFromWantAnswer,
  nextUnresolvedDaypartCategory,
  retainedDaypartFallbackCategory,
  type LiveShelf,
} from "./DaypartNeeds";

describe("DaypartNeeds", () => {
  it("retains server photo credit only for the exact live place and unchanged resource", () => {
    const photo = "/api/place-photo?name=places%2Flocal%2Fphotos%2Ffirst";
    const photoAttribution = { photo_name: "places/local/photos/first", google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [] };
    const row = { category: "coffee", label: "Coffee", href: "/nearby?c=coffee", picks: [{ slug: "local", name: "Local", rating: null, confidence: "unconfirmed" as const, photo, photoAttribution }] };
    const candidate = { slug: "local", name: "Local", photo, where: "Brunswick", distance: null, fact: "Hours not confirmed" };
    const answer = { hero: candidate, also: [], browseHref: row.href, contextLabel: "Brunswick", contextSource: "town" as const };
    expect(liveShelfFromWantAnswer(answer, row, "town:brunswick").picks[0].photoAttribution).toBe(photoAttribution);
    for (const changed of [{ ...candidate, slug: "other" }, { ...candidate, photo: "/api/place-photo?name=places%2Flocal%2Fphotos%2Fnew" }]) {
      expect(liveShelfFromWantAnswer({ ...answer, hero: changed }, row, "town:brunswick").picks[0].photoAttribution).toBeUndefined();
    }
  });

  it.each([null, "/test-place.jpg"])("keeps the town and walking estimate together with photo %s", (photo) => {
    const html = renderToStaticMarkup(createElement(DaypartNeeds, {
      variant: "brief",
      rows: [{ category: "coffee", label: "Coffee", href: "/nearby?c=coffee&in=brunswick", picks: [{
        slug: "local-option", name: "Local option", rating: null, photo,
        where: "Brunswick", distance: "6 min walk", confidence: "unconfirmed", fact: "Hours not confirmed",
      }] }],
    }));
    expect(html).toContain("Brunswick");
    expect(html).toContain("6 min walk");
    expect(html).toContain("Hours not confirmed");
    expect(html).toContain("Places to try");
    // Cached first paint has no request-specific URL lens yet. Keep the
    // native destination useful without inventing a county return URL.
    expect(html).toContain('href="/places/local-option"');
    expect(html).toContain('href="/map?place=local-option"');
    expect(html).toContain('aria-label="Map: Local option"');
    expect(html).not.toContain("Open now");
  });

  it("keeps opening-soon town context when a walking estimate is known", () => {
    const html = renderToStaticMarkup(createElement(DaypartNeeds, {
      variant: "brief",
      rows: [{ category: "coffee", label: "Coffee", href: "/nearby?c=coffee&in=brunswick", picks: [], openingSoon: {
        slug: "opening-local", name: "Opening local", rating: null,
        where: "Brunswick", distance: "6 min walk", confidence: "confirmed", fact: "Opens soon · 10am",
      } }],
    }));
    expect(html).toContain("Brunswick");
    expect(html).toContain("6 min walk");
    expect(html).toContain("Opens soon · 10am");
    expect(html).toContain('data-today-opening-soon-preview="true"');
    expect(html).toContain('aria-label="View place: Opening local"');
    expect(html).toContain('aria-label="Map: Opening local"');
    expect(html).toContain('data-place-availability="opening-soon"');
    expect(html).toContain('data-decision-position="opening-soon"');
    expect(html.match(/>Opening soon</g)).toHaveLength(1);
    expect(html).not.toContain('data-today-place-lead="true"');
    expect(html).not.toContain("Open now");
  });

  it("shows one open-now shelf while keeping the other categories available as tabs", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [
              {
                slug: "first-cup",
                name: "First Cup",
                rating: 4.7,
                where: "Urbana",
                confidence: "confirmed",
              },
            ],
          },
          {
            category: "bakery",
            label: "Bakeries",
            href: "/category/bakery",
            picks: [{
              slug: "second-loaf",
              name: "Second Loaf",
              rating: 4.6,
              confidence: "confirmed",
            }],
          },
        ],
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Coffee");
    expect(html).toContain("Bakeries");
    expect(html).toContain("First Cup");
    expect(html).toContain("Across Frederick County");
    expect(html).not.toContain("Countywide picks");
    expect(html).toContain("Urbana");
    expect(html).not.toContain("Nearby picks");
    expect(html).not.toContain("Right now, around here");
    expect(html).not.toContain("Second Loaf");
  });

  it("does not let an empty weather category suppress a useful daypart category", () => {
    const rows = [
      {
        category: "museum",
        label: "Museums & indoors",
        href: "/category/museum",
        picks: [],
      },
      {
        category: "restaurant",
        label: "Dinner",
        href: "/category/restaurant",
        picks: [
          {
            slug: "downtown-dinner",
            name: "Downtown Dinner",
            rating: 4.7,
            where: "Frederick",
            confidence: "confirmed" as const,
          },
        ],
      },
      {
        category: "bar",
        label: "Bars",
        href: "/category/bar",
        picks: [],
      },
    ];

    expect(initialDaypartCategory(rows)).toBe("restaurant");

    const html = renderToStaticMarkup(createElement(DaypartNeeds, { rows }));
    expect(html).toContain("Downtown Dinner");
    expect(html).toContain("Museums &amp; indoors");
    expect(html).toContain("Bars");
    expect(html).not.toContain("No place across Frederick County");
  });

  it("treats an opening-soon transition as a useful starting category", () => {
    const rows = [
      {
        category: "museum",
        label: "Museums & indoors",
        href: "/category/museum",
        picks: [],
      },
      {
        category: "coffee",
        label: "Coffee",
        href: "/category/coffee",
        picks: [],
        openingSoon: {
          slug: "gravel-and-grind-frederick",
          name: "Gravel & Grind",
          rating: 4.8,
          confidence: "likely" as const,
          fact: "Likely opens at 8am · check hours",
        },
      },
    ];

    expect(initialDaypartCategory(rows)).toBe("coffee");
    expect(
      nextUnresolvedDaypartCategory(rows, "museum", { museum: true }),
    ).toBe("coffee");
  });

  it("lets brief Today skip an unconfirmed shelf for a confirmed answer", () => {
    const rows = [
      {
        category: "coffee",
        label: "Coffee",
        href: "/category/coffee",
        picks: [
          {
            slug: "hours-unknown-coffee",
            name: "Hours Unknown Coffee",
            rating: 4.7,
            confidence: "unconfirmed" as const,
          },
        ],
      },
      {
        category: "bakery",
        label: "Bakeries",
        href: "/category/bakery",
        picks: [
          {
            slug: "confirmed-bakery",
            name: "Confirmed Bakery",
            rating: 4.8,
            confidence: "confirmed" as const,
          },
        ],
      },
    ];

    expect(daypartUsablePickCount(rows[0], "brief")).toBe(0);
    expect(initialDaypartCategory(rows, "brief")).toBe("bakery");
    expect(
      nextUnresolvedDaypartCategory(
        rows,
        "coffee",
        { coffee: true },
        "brief",
      ),
    ).toBe("bakery");

    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, { rows, variant: "brief" }),
    );
    expect(html).toContain("Confirmed Bakery");
    expect(html).not.toContain("Hours Unknown Coffee");
  });

  it("recovers only a fully settled unconfirmed shelf in original category order", () => {
    const rows = ["restaurant", "brewery", "bar"].map((category) => ({ category, label: category, href: `/category/${category}`, picks: [] }));
    const shelf = (name: string): LiveShelf => ({ picks: [{ slug: name, name, rating: null, confidence: "unconfirmed", fact: "Hours not confirmed" }],
      openingSoon: null, href: "/nearby", contextLabel: "Brunswick", contextSource: "town", mayAssertNoneOpen: false });
    // Insertion order is deliberately different from the original categories.
    const shelves = { brewery: shelf("Brewery"), restaurant: shelf("First restaurant"), bar: { ...shelf("Bar"), picks: [] } };
    const settled = { restaurant: true, brewery: true, bar: true };
    expect(retainedDaypartFallbackCategory(rows, shelves, { ...settled, bar: false })).toBeNull();
    expect(retainedDaypartFallbackCategory(rows, shelves, settled)).toBe("restaurant");
    for (const confidence of ["confirmed", "likely"] as const) {
      expect(retainedDaypartFallbackCategory(rows, { ...shelves, brewery: { ...shelves.brewery,
        picks: [{ ...shelves.brewery.picks[0], confidence }] } }, settled)).toBeNull();
    }
    expect(retainedDaypartFallbackCategory(rows, { ...shelves, brewery: { ...shelves.brewery,
      openingSoon: { slug: "soon", name: "Soon", rating: null, confidence: "likely" } } }, settled)).toBeNull();
    expect(retainedDaypartFallbackCategory(rows, {}, settled)).toBeNull();
  });

  it("checks another category after a live zero instead of treating one zero as global", () => {
    const rows = [
      {
        category: "museum",
        label: "Museums & indoors",
        href: "/category/museum",
        picks: [],
      },
      {
        category: "book-store",
        label: "Bookstores & cozy corners",
        href: "/category/book-store",
        picks: [],
      },
      {
        category: "restaurant",
        label: "Dinner",
        href: "/category/restaurant",
        picks: [
          {
            slug: "downtown-dinner",
            name: "Downtown Dinner",
            rating: 4.7,
            confidence: "confirmed" as const,
          },
        ],
      },
    ];

    expect(
      nextUnresolvedDaypartCategory(rows, "museum", { museum: true }),
    ).toBe("restaurant");
    expect(
      nextUnresolvedDaypartCategory(rows, "restaurant", {
        museum: true,
        restaurant: true,
      }),
    ).toBe("book-store");
    expect(
      nextUnresolvedDaypartCategory(rows, "book-store", {
        museum: true,
        "book-store": true,
        restaurant: true,
      }),
    ).toBeNull();
  });

  it("keeps an empty server shelf mounted while the live location-aware answer loads", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [],
          },
        ],
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Checking nearby");
    expect(html).toContain("Loading open coffee places");
    expect(html).not.toContain("Nothing in this group is confirmed open right now");
  });

  it("uses a compact inline state when the live shelf has no confirmed-open places", () => {
    const html = renderToStaticMarkup(createElement(DaypartEmptyState));

    expect(html).toContain('role="status"');
    expect(html).toContain("Places open now");
    expect(html).toContain("Across Frederick County");
    expect(html).toContain(
      "Current hours do not confirm an open match for this group across Frederick County.",
    );
    expect(html).toContain("Browse places");
    expect(html).toContain('href="/open-now"');
    expect(html).toContain("rounded-[var(--app-radius-md)]");
    expect(html).not.toContain("border-dashed");
    expect(html).not.toContain(">0 confirmed open<");
  });

  it("names an empty town scope and offers a countywide fallback", () => {
    const html = renderToStaticMarkup(
      DaypartEmptyState({
        contextLabel: "Urbana",
        countywide: false,
        href: "/nearby?c=coffee&in=county",
      }),
    );

    expect(html).toContain(
      "Current hours do not confirm an open match for this group in Urbana.",
    );
    expect(html).toContain("Expand to county");
    expect(html).toContain('href="/nearby?c=coffee&amp;in=county"');
  });

  it("only reports a closed shelf when the live answer clears the coverage gate", () => {
    const html = renderToStaticMarkup(
      DaypartEmptyState({
        contextLabel: "Urbana",
        countywide: false,
        mayReportNoneOpen: true,
      }),
    );

    expect(html).toContain("No open match for this group in Urbana right now.");
    expect(html).not.toContain("hours showing it open");
  });

  it("states an empty category narrowly instead of making a countywide claim", () => {
    expect(
      daypartEmptyCopy(
        "Across Frederick County",
        true,
        false,
        "Museums & indoors",
      ),
    ).toBe(
      "Current hours do not confirm an open match for museums & indoors across Frederick County.",
    );
    expect(
      daypartEmptyCopy("Urbana", false, true, "Coffee"),
    ).toBe("No open match for coffee in Urbana right now.");
  });

  it("treats ranking origins as countywide and only a town as a hard scope", () => {
    expect(isDaypartCountywideContext("town")).toBe(false);
    expect(isDaypartCountywideContext("device")).toBe(true);
    expect(isDaypartCountywideContext("home")).toBe(true);
    expect(isDaypartCountywideContext("ip")).toBe(true);
    expect(isDaypartCountywideContext("county")).toBe(true);
    expect(isDaypartCountywideContext("none")).toBe(true);
  });

  it("only calls picks nearby when a real user location is active", () => {
    expect(daypartPickScopeLabel("county", "Whole county")).toBe(
      "Countywide picks",
    );
    expect(daypartPickScopeLabel("none", "Frederick County")).toBe(
      "Countywide picks",
    );
    expect(daypartPickScopeLabel("ip", "Ranked from Frederick")).toBe(
      "Countywide picks",
    );
    expect(daypartPickScopeLabel("device", "Near you")).toBe("Nearby picks");
    expect(daypartPickScopeLabel("home", "Near home")).toBe("Nearby picks");
    expect(daypartPickScopeLabel("town", "Urbana")).toBe("Urbana picks");
  });

  it("keeps a successful scoped zero instead of restoring countywide picks", () => {
    const shelf = liveShelfFromWantAnswer(
      {
        hero: null,
        also: [],
        browseHref: "/category/coffee",
        contextLabel: "Urbana",
        contextSource: "town",
        mayAssertNoneOpen: false,
      },
      {
        category: "coffee",
        label: "Coffee",
        href: "/category/coffee",
        picks: [{
          slug: "countywide-cup",
          name: "Countywide Cup",
          rating: 4.5,
          confidence: "confirmed",
        }],
      },
      "town:urbana",
    );

    expect(shelf.picks).toEqual([]);
    expect(shelf.contextLabel).toBe("Urbana");
    expect(shelf.contextSource).toBe("town");
    expect(shelf.mayAssertNoneOpen).toBe(false);
    expect(shelf.href).toBe("/nearby?c=coffee&in=urbana");
  });

  it("maps the live opening-soon row and removes it from current picks", () => {
    const shelf = liveShelfFromWantAnswer(
      {
        hero: {
          slug: "gravel-and-grind-frederick",
          name: "Gravel & Grind",
          photo: null,
          where: "Frederick",
          distance: "3 min walk",
          fact: "Hours not confirmed",
        },
        also: [],
        soon: {
          slug: "gravel-and-grind-frederick",
          name: "Gravel & Grind",
          photo: null,
          where: "Frederick",
          distance: "3 min walk",
          fact: "Likely opens at 8am · check hours",
          confidence: "likely",
        },
        browseHref: "/category/coffee",
        contextLabel: "Near you",
        contextSource: "device",
        mayAssertNoneOpen: false,
      },
      {
        category: "coffee",
        label: "Coffee",
        href: "/category/coffee",
        picks: [],
      },
      "nearme",
    );

    expect(shelf.picks).toEqual([]);
    expect(shelf.openingSoon).toMatchObject({
      slug: "gravel-and-grind-frederick",
      confidence: "likely",
      fact: "Likely opens at 8am · check hours",
    });
  });

  it("explains the lead with current hours and consented-device distance first", () => {
    const shelf = liveShelfFromWantAnswer(
      {
        hero: {
          slug: "local-cup",
          name: "Local Cup",
          photo: null,
          where: "Frederick",
          distance: "4 min walk",
          fact: "Open until 4pm",
          confidence: "confirmed",
          decisionReasons: [
            { id: "availability", label: "Its current hours show it open now.", evidenceIds: ["verified-hours"] },
            { id: "proximity", label: "It is close to your location.", evidenceIds: ["decision-origin"] },
            { id: "local-favorite", label: "Radius has this marked as a local favorite.", evidenceIds: ["radius-curation"] },
          ],
        },
        also: [],
        browseHref: "/category/coffee",
        contextLabel: "Near you",
        contextSource: "device",
        mayAssertNoneOpen: false,
      },
      {
        category: "coffee",
        label: "Coffee",
        href: "/category/coffee",
        picks: [],
      },
      "nearme",
    );

    expect(daypartLeadReason(shelf.picks)).toBe(
      "It is open until 4pm and is a 4-minute walk from you.",
    );
  });

  it("omits curation-only brief justifications while keeping factual hours and distance", () => {
    const pick = {
      slug: "real-option", name: "Real option", rating: null,
      confidence: "unconfirmed" as const, fact: "Hours not confirmed",
      decisionReasons: [{ id: "local-favorite", label: "Radius has this marked as a local favorite.", evidenceIds: ["radius-curation"] }],
    };
    expect(daypartLeadReason([pick], { includeEditorialLabels: false })).toBeNull();
    expect(daypartLeadReason([pick])).toBe("Radius has this marked as a local favorite.");
    expect(daypartLeadReason([{ ...pick, confidence: "confirmed", fact: "Open until 4pm", distance: "4 min walk" }], { includeEditorialLabels: false }))
      .toBe("It is open until 4pm and is a 4-minute walk from you.");
    const html = renderToStaticMarkup(createElement(DaypartNeeds, {
      variant: "brief", rows: [{ category: "coffee", label: "Coffee", href: "/places?category=coffee", picks: [pick] }],
    }));
    expect(html).toContain("Real option");
    expect(html).toContain("Hours not confirmed");
    expect(html).not.toContain("Why it leads");
    expect(html).not.toContain("local favorite");
  });

  it("uses evidence-backed availability before generic popularity evidence", () => {
    expect(daypartLeadReason([{
      slug: "nearby-only",
      name: "Nearby Only",
      rating: null,
      confidence: "confirmed",
      fact: "Open now",
      decisionReasons: [
        { id: "availability", label: "Its current hours show it open now.", evidenceIds: [] },
        { id: "review-evidence", label: "It has substantial Google review history.", evidenceIds: [] },
      ],
    }])).toBe("Current hours show it is open now.");
  });

  it("uses an exact distance before a generic review-history tie-breaker", () => {
    expect(daypartLeadReason([{
      slug: "nearby-only",
      name: "Nearby Only",
      rating: null,
      confidence: "confirmed",
      distance: "0.4 mi",
      decisionReasons: [
        { id: "review-evidence", label: "It has substantial Google review history.", evidenceIds: [] },
      ],
    }])).toBe("It is 0.4 miles from you.");
  });

  it("never turns an unknown-hours best-fit row into an open-now card", () => {
    const shelf = liveShelfFromWantAnswer(
      {
        hero: {
          slug: "unknown-hours",
          name: "Unknown Hours",
          photo: null,
          where: "Frederick",
          distance: null,
          fact: "Hours not posted",
        },
        also: [
          {
            slug: "confirmed-open",
            name: "Confirmed Open",
            photo: null,
            where: "Frederick",
            distance: null,
            fact: "Open until 11pm",
            confidence: "confirmed",
          },
        ],
        browseHref: "/category/bar",
        contextLabel: "Whole county",
        contextSource: "county",
        mayAssertNoneOpen: false,
      },
      {
        category: "bar",
        label: "Bars open late",
        href: "/category/bar",
        picks: [],
      },
      null,
    );

    // The unknown-hours row is kept — it is a real place, and dropping it is
    // what left Today printing "Current hours do not confirm an open match"
    // over an empty shelf — but it may never lead or wear an open-now label.
    expect(shelf.picks.map((pick) => pick.slug)).toEqual([
      "confirmed-open",
      "unknown-hours",
    ]);
    expect(shelf.picks[0].confidence).toBe("confirmed");
    expect(shelf.picks[1].confidence).toBe("unconfirmed");
  });

  it("keeps real places when the county cannot confirm anyone's hours", () => {
    // The regression this guards: when the rolling hours refresh ages out, the
    // ranker returns its notable lane (real places, no open claim) and Today
    // used to discard every one of them, leaving a lone sentence — "Current
    // hours do not confirm an open match for breakfast & bakeries across
    // Frederick County" — above an empty shelf.
    const shelf = liveShelfFromWantAnswer(
      {
        hero: {
          slug: "bakehouse",
          name: "Bakehouse",
          photo: null,
          where: "Frederick",
          distance: null,
          fact: "Hours not posted",
        },
        also: [
          {
            slug: "second-bakery",
            name: "Second Bakery",
            photo: null,
            where: "Brunswick",
            distance: null,
            fact: "Hours not confirmed",
          },
        ],
        browseHref: "/category/bakery",
        contextLabel: "Across Frederick County",
        contextSource: "county",
        mayAssertNoneOpen: false,
      },
      {
        category: "bakery",
        label: "Breakfast & bakeries",
        href: "/category/bakery",
        picks: [],
      },
      null,
    );

    expect(shelf.picks.map((pick) => pick.slug)).toEqual([
      "bakehouse",
      "second-bakery",
    ]);
    expect(shelf.picks.every((pick) => pick.confidence === "unconfirmed")).toBe(
      true,
    );
  });

  it("never claims open on a shelf whose hours are all unconfirmed", () => {
    expect(
      daypartShelfTier([
        { slug: "a", name: "A", rating: null, confidence: "unconfirmed" },
        { slug: "b", name: "B", rating: null, confidence: "unconfirmed" },
      ]),
    ).toBe("unconfirmed");
    // A mixed shelf keeps the lead card's tier, matching the pre-existing
    // confirmed/likely convention; each row still states its own hours.
    expect(
      daypartShelfTier([
        { slug: "a", name: "A", rating: null, confidence: "confirmed" },
        { slug: "b", name: "B", rating: null, confidence: "unconfirmed" },
      ]),
    ).toBe("confirmed");
    expect(
      daypartShelfTier([
        { slug: "a", name: "A", rating: null, confidence: "likely" },
        { slug: "b", name: "B", rating: null, confidence: "unconfirmed" },
      ]),
    ).toBe("likely");
  });

  it("gives mixed current and opening-soon shelves an explicit heading", () => {
    const soon = {
      slug: "soon",
      name: "Soon",
      rating: null,
      confidence: "likely" as const,
    };
    expect(
      daypartShelfHeading(
        [{ slug: "open", name: "Open", rating: null, confidence: "confirmed" }],
        soon,
      ),
    ).toEqual({
      title: "Open now and soon",
      aria: "Places open now and opening soon",
    });
    expect(
      daypartShelfHeading(
        [{ slug: "unknown", name: "Unknown", rating: null, confidence: "unconfirmed" }],
        soon,
      ),
    ).toEqual({
      title: "Places for now and soon",
      aria: "Places for now and opening soon",
    });
    expect(daypartShelfHeading([], soon)).toEqual({
      title: "Opening soon",
      aria: "Place opening soon",
    });
  });

  it("labels curated fallback cards as likely instead of confirmed open", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [{
              slug: "likely-cup",
              name: "Likely Cup",
              rating: 4.6,
              confidence: "likely",
              fact: "Likely open",
            }],
          },
        ],
      }),
    );

    expect(html).toContain(
      "Countywide picks · Posted hours; check before going",
    );
    expect(html).not.toContain('aria-label="Likely Cup');
    expect(html).toContain("Likely Cup");
    expect(html).toContain("Likely open");
    expect(html).not.toContain("confirmed open");
  });

  it("renders opening soon as its own honest, actionable state", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [],
            openingSoon: {
              slug: "gravel-and-grind-frederick",
              name: "Gravel & Grind",
              rating: 4.8,
              photo: null,
              where: "Frederick",
              confidence: "likely",
              fact: "Likely opens at 8am · check hours",
            },
          },
        ],
      }),
    );

    expect(html).toContain('aria-label="Place opening soon"');
    expect(html).toContain('data-today-opening-soon="true"');
    expect(html).toContain('data-place-availability="opening-soon"');
    expect(html).toContain('data-decision-position="opening-soon"');
    expect(html).toContain("Gravel &amp; Grind");
    expect(html).toContain("Likely opens at 8am · check hours");
    expect(html).not.toContain("Places open now");
    expect(html).not.toContain('data-today-place-lead="true"');
    expect(html).not.toContain("data-today-opening-soon-preview");
    expect(html).not.toContain('aria-label="Map: Gravel &amp; Grind"');
    expect(html).toContain('href="/places/gravel-and-grind-frederick"');
  });

  it("defers supplied paid photo bytes and retains a composed no-photo decision", () => {
    const renderPick = (photo?: string) =>
      renderToStaticMarkup(
        createElement(DaypartNeeds, {
          rows: [
            {
              category: "coffee",
              label: "Coffee",
              href: "/category/coffee",
              picks: [
                {
                  slug: "gravel-and-grind",
                  name: "Gravel & Grind",
                  rating: 4.8,
                  photo,
                  photoAttribution: { photo_name: "places/ChIJtest/photos/front", google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [] },
                  where: "Frederick",
                  confidence: "confirmed",
                },
              ],
            },
          ],
        }),
      );

    const withPhoto = renderPick(
      "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=800",
    );
    expect(withPhoto).toContain('data-place-card-photo-source="google"');
    expect(withPhoto).toContain('data-place-card-photo-bytes="idle"');
    expect(withPhoto).not.toContain("<img");
    expect(withPhoto).toContain('visibility:hidden');
    expect(withPhoto).not.toContain('data-radius-plate="gravel-and-grind"');

    const withoutPhoto = renderPick();
    expect(withoutPhoto).not.toContain("<img");
    expect(withoutPhoto).not.toContain('data-radius-plate="gravel-and-grind"');
    expect(withoutPhoto).toContain("Open now");
    expect(withoutPhoto).toContain('data-today-place-lead="true"');
    expect(withoutPhoto).toContain('data-has-photo="false"');
    expect(withoutPhoto).not.toContain("data-place-card-photo=");
    expect(withoutPhoto).toContain('aria-label="Map: Gravel &amp; Grind"');
    // A place name identifies the place, so it wraps instead of clipping.
    // "National Museum of Civil War Medicine" truncated to "National Museum
    // of Ci…" is not a recommendation the reader can act on.
    expect(withoutPhoto).toContain("Gravel &amp; Grind");
    expect(withoutPhoto).toContain("Frederick");
  });

  it("edits Today to one lead and two alternatives", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: ["Lead", "Second", "Third", "Fourth"].map((name, index) => ({
              slug: `pick-${index}`,
              name,
              rating: 4.8 - index / 10,
              where: "Frederick",
              confidence: "confirmed" as const,
            })),
          },
        ],
      }),
    );

    expect(html).toContain("Lead");
    expect(html).toContain("Second");
    expect(html).toContain("Third");
    expect(html).not.toContain("Fourth");
  });

  it("keeps the briefing variant to one useful lead with a route to every choice", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        variant: "brief",
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: ["Lead", "Second", "Third"].map((name, index) => ({
              slug: `pick-${index}`,
              name,
              rating: 4.8 - index / 10,
              where: "Frederick",
              confidence: "confirmed" as const,
            })),
            openingSoon: {
              slug: "opening-next",
              name: "Opening Next",
              rating: null,
              where: "Frederick",
              confidence: "likely" as const,
              fact: "Likely opens at 8am · check hours",
            },
          },
        ],
      }),
    );

    expect(html).toContain('data-today-decision-density="brief"');
    expect(html).toContain('aria-label="Open places right now"');
    expect(html).not.toContain("Open now and soon");
    expect(html).toContain("Lead");
    expect(html).not.toContain("Second");
    expect(html).not.toContain("Third");
    expect(html).not.toContain("Opening Next");
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('href="/nearby?c=coffee&amp;in=county"');
    expect(html).toContain("Across Frederick County");
    expect(html).toContain("Browse places");
  });

  it("names county geography for the confirmed opening-soon briefing before hydration", () => {
    const html = renderToStaticMarkup(createElement(DaypartNeeds, {
      variant: "brief",
      rows: [{ category: "coffee", label: "Coffee", href: "/nearby?c=coffee", picks: [],
        openingSoon: { slug: "county-opening", name: "County opening place", rating: null,
          where: "Frederick", confidence: "confirmed", fact: "Opens soon · 4pm" } }],
    }));
    expect(html).toContain("Across Frederick County");
    expect(html).toContain('href="/nearby?c=coffee&amp;in=county"');
    expect(html).toContain('aria-label="Place opening soon"');
    expect(html).not.toContain('aria-label="Open places right now"');
  });

  it("lets an opening-soon transition replace an uncertain briefing pick", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        variant: "brief",
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: [
              {
                slug: "hours-unknown",
                name: "Hours Unknown",
                rating: 4.8,
                where: "Frederick",
                confidence: "unconfirmed" as const,
              },
            ],
            openingSoon: {
              slug: "gravel-and-grind-frederick",
              name: "Gravel & Grind",
              rating: 4.8,
              where: "Frederick",
              confidence: "likely" as const,
              fact: "Likely opens at 8am · check hours",
            },
          },
        ],
      }),
    );

    expect(html).toContain("Gravel &amp; Grind");
    expect(html).toContain('aria-label="Place opening soon"');
    expect(html).toContain('data-today-opening-soon="true"');
    expect(html).not.toContain("Hours Unknown");
    expect(html).not.toContain('data-today-place-lead="true"');
  });

  it("keeps a real option without claiming it is open when all hours are unconfirmed", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        variant: "brief",
        rows: [
          {
            category: "museum",
            label: "Museums & indoors",
            href: "/category/museum",
            picks: [
              {
                slug: "hours-unknown",
                name: "Hours Unknown",
                rating: 4.8,
                where: "Frederick",
                confidence: "unconfirmed" as const,
              },
            ],
          },
        ],
      }),
    );

    expect(html).toContain("Hours Unknown");
    expect(html).toContain('data-today-place-lead="true"');
    expect(html).toContain("Places to try");
    expect(html).toContain("Hours not confirmed");
    expect(html).toContain('href="/nearby?c=art&amp;facet=museum&amp;in=county"');
    expect(html.match(/href="\/nearby\?c=art&amp;facet=museum&amp;in=county"/g)).toHaveLength(1);
    expect(html).toContain("Browse places");
  });

  it("counts opening soon inside the three-choice decision set", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        rows: [
          {
            category: "coffee",
            label: "Coffee",
            href: "/category/coffee",
            picks: ["Lead", "Second", "Third", "Fourth"].map((name, index) => ({
              slug: `pick-${index}`,
              name,
              rating: 4.8 - index / 10,
              where: "Frederick",
              confidence: "confirmed" as const,
            })),
            openingSoon: {
              slug: "soon",
              name: "Opening Next",
              rating: null,
              where: "Frederick",
              confidence: "likely" as const,
              fact: "Likely opens at 8am · check hours",
            },
          },
        ],
      }),
    );

    expect(html).toContain("Lead");
    expect(html).toContain("Second");
    expect(html).toContain("Opening Next");
    expect(html).not.toContain("Third");
    expect(html).not.toContain("Fourth");
    expect(html).toContain('data-shelf-two="true"');
  });

  it("uses the photo proxy signal and recognizes its 1x1 failure image", () => {
    expect(
      daypartPhotoSrc(
        "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=800",
      ),
    ).toBe(
      "/api/place-photo?name=places%2FChIJtest%2Fphotos%2Ffront&w=800&fallback=signal",
    );
    expect(
      daypartPhotoSrc("https://images.example.com/coffee.jpg"),
    ).toBe("https://images.example.com/coffee.jpg");
    expect(
      isPhotoFailureSignal({ naturalWidth: 1, naturalHeight: 1 }),
    ).toBe(true);
    expect(
      isPhotoFailureSignal({ naturalWidth: 800, naturalHeight: 600 }),
    ).toBe(false);
  });

  it("keeps expanded daypart results on the location-aware Nearby journey", () => {
    expect(daypartBrowseHref("coffee", "Coffee", "nearme")).toBe(
      "/nearby?c=coffee&in=nearme",
    );
    expect(daypartBrowseHref("restaurant", "Dinner", "town:brunswick")).toBe(
      "/nearby?c=dinner&in=brunswick",
    );
    expect(daypartBrowseHref("bar", "Bars open late", "county")).toBe(
      "/nearby?c=drinks&facet=bar&in=county",
    );
    expect(daypartBrowseHref("museum", "Museums & indoors")).toBe(
      "/nearby?c=art&facet=museum",
    );
  });
});
