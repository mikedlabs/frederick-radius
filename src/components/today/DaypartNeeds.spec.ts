import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaypartNeeds, {
  DaypartEmptyState,
  daypartBrowseHref,
  daypartEmptyCopy,
  daypartLeadReason,
  daypartPhotoSrc,
  daypartPickScopeLabel,
  initialDaypartCategory,
  isPhotoFailureSignal,
  isDaypartCountywideContext,
  liveShelfFromWantAnswer,
  nextUnresolvedDaypartCategory,
} from "./DaypartNeeds";

describe("DaypartNeeds", () => {
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

    expect(shelf.picks.map((pick) => pick.slug)).toEqual(["confirmed-open"]);
    expect(shelf.picks[0].confidence).toBe("confirmed");
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

  it("renders a supplied business photo and falls back only when it is absent", () => {
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
    expect(withPhoto).toContain("<img");
    expect(withPhoto).toContain("places%2FChIJtest%2Fphotos%2Ffront");
    expect(withPhoto).toContain("fallback=signal");
    expect(withPhoto).not.toContain('data-radius-plate="gravel-and-grind"');

    const withoutPhoto = renderPick();
    expect(withoutPhoto).not.toContain("<img");
    expect(withoutPhoto).not.toContain('data-radius-plate="gravel-and-grind"');
    expect(withoutPhoto).toContain("min-h-[76px]");
    expect(withoutPhoto).toContain('data-today-place-lead="true"');
    expect(withoutPhoto).toContain("w-[14.5rem]");
    expect(withoutPhoto).toContain('class="h-[18px] w-[18px]"');
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
