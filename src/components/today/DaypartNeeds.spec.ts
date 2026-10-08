import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaypartNeeds, {
  DaypartEmptyState,
  daypartBrowseHref,
  daypartEmptyCopy,
  daypartPhotoSrc,
  daypartPickScopeLabel,
  daypartShelfConfidenceRank,
  daypartShelfHeading,
  daypartShelfTier,
  daypartTileFact,
  daypartUsablePickCount,
  initialDaypartCategory,
  isPhotoFailureSignal,
  isDaypartCountywideContext,
  keepsServerDaypartShelf,
  liveShelfFromWantAnswer,
  nextUnresolvedDaypartCategory,
  serverDaypartShelf,
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
    expect(html).not.toContain("Countywide picks");
    // A countywide tile names its town after the hours fact.
    expect(html).toContain("Open now · Urbana");
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

  describe("server shelf confidence guard", () => {
    // Oct 6, 10:55 PM Eastern (a Tuesday). Hootch & Banter's curated window
    // runs 4pm to 11:59pm, so the server shelf honestly called it likely open.
    const lateTuesday = new Date("2026-10-07T02:55:00.000Z");
    const afterWindow = new Date("2026-10-07T04:30:00.000Z");
    const serverRow = {
      category: "bar",
      label: "Bars open late",
      href: "/category/bar",
      picks: [{
        slug: "hootch-and-banter-frederick",
        name: "Hootch & Banter",
        rating: 4.6,
        where: "Frederick",
        confidence: "likely" as const,
        fact: "Likely open · check hours",
      }],
    };
    const unconfirmedAnswer = (contextSource: "county" | "device" | "town") => ({
      hero: {
        slug: "mcclintocks-back-bar",
        name: "McClintock's Back Bar",
        photo: null,
        where: "Frederick",
        distance: null,
        fact: "Hours not confirmed",
        decisionReasons: [
          { id: "local-favorite", label: "Radius has this marked as a local favorite.", evidenceIds: ["radius-curation"] },
        ],
      },
      also: [],
      browseHref: "/category/bar",
      contextLabel: contextSource === "town" ? "Urbana" : "Whole county",
      contextSource,
      mayAssertNoneOpen: false,
    });

    it("ranks shelves by their strongest hours evidence", () => {
      expect(daypartShelfConfidenceRank([])).toBe(Number.POSITIVE_INFINITY);
      expect(
        daypartShelfConfidenceRank([
          { confidence: "unconfirmed" },
          { confidence: "likely" },
        ]),
      ).toBeLessThan(daypartShelfConfidenceRank([{ confidence: "unconfirmed" }]));
      expect(daypartShelfConfidenceRank([{ confidence: "confirmed" }])).toBeLessThan(
        daypartShelfConfidenceRank([{ confidence: "likely" }]),
      );
    });

    it("keeps a likely server shelf over an unconfirmed live shelf", () => {
      for (const source of ["county", "device"] as const) {
        const live = liveShelfFromWantAnswer(
          unconfirmedAnswer(source),
          serverRow,
          source === "device" ? "nearme" : "county",
        );
        expect(keepsServerDaypartShelf(serverRow, live, lateTuesday)).toBe(true);
      }

      const kept = serverDaypartShelf(serverRow, lateTuesday);
      expect(kept.picks.map((pick) => pick.slug)).toEqual([
        "hootch-and-banter-frederick",
      ]);
      expect(kept.picks[0]).toMatchObject({
        confidence: "likely",
        fact: "Likely open · check hours",
      });
      expect(kept).toMatchObject({
        href: "/category/bar",
        contextLabel: "Across Frederick County",
        contextSource: "county",
        mayAssertNoneOpen: false,
      });
    });

    it("keeps a server shelf over a countywide live zero", () => {
      const live = liveShelfFromWantAnswer(
        { ...unconfirmedAnswer("county"), hero: null },
        serverRow,
        "county",
      );
      expect(keepsServerDaypartShelf(serverRow, live, lateTuesday)).toBe(true);
    });

    it("lets a town scope replace the countywide shelf even with weaker evidence", () => {
      const live = liveShelfFromWantAnswer(
        unconfirmedAnswer("town"),
        serverRow,
        "town:urbana",
      );
      expect(keepsServerDaypartShelf(serverRow, live, lateTuesday)).toBe(false);
    });

    it("lets the live answer win once cached likely picks have aged out", () => {
      const live = liveShelfFromWantAnswer(
        unconfirmedAnswer("county"),
        serverRow,
        "county",
      );
      expect(keepsServerDaypartShelf(serverRow, live, afterWindow)).toBe(false);
      expect(serverDaypartShelf(serverRow, afterWindow).picks).toEqual([]);
    });

    it("lets a live answer that can report nothing open replace the shelf", () => {
      const live = liveShelfFromWantAnswer(
        { ...unconfirmedAnswer("county"), hero: null, mayAssertNoneOpen: true },
        serverRow,
        "county",
      );
      expect(keepsServerDaypartShelf(serverRow, live, lateTuesday)).toBe(false);
    });

    it("drops a cached confirmed pick once its stated closing time passes", () => {
      const confirmedRow = {
        ...serverRow,
        picks: [{
          slug: "early-close-bar",
          name: "Early Close Bar",
          rating: 4.4,
          confidence: "confirmed" as const,
          fact: "Open until 10pm",
        }],
      };
      const lateRow = {
        ...serverRow,
        picks: [{
          slug: "late-close-bar",
          name: "Late Close Bar",
          rating: 4.4,
          confidence: "confirmed" as const,
          fact: "Closing soon · 2am",
        }],
      };
      const live = liveShelfFromWantAnswer(
        unconfirmedAnswer("county"),
        serverRow,
        "county",
      );
      const ninePm = new Date("2026-10-07T01:00:00.000Z");
      const tenThirtyPm = new Date("2026-10-07T02:30:00.000Z");

      expect(keepsServerDaypartShelf(confirmedRow, live, ninePm)).toBe(true);
      expect(keepsServerDaypartShelf(confirmedRow, live, tenThirtyPm)).toBe(false);
      expect(serverDaypartShelf(confirmedRow, tenThirtyPm).picks).toEqual([]);
      // A past-midnight close is still ahead late in the evening.
      expect(keepsServerDaypartShelf(lateRow, live, tenThirtyPm)).toBe(true);
    });

    it("accepts a live shelf of equal or stronger evidence", () => {
      const likelyLive = liveShelfFromWantAnswer(
        {
          ...unconfirmedAnswer("county"),
          hero: {
            slug: "bushwaller-irish-pub-frederick",
            name: "Bushwaller's",
            photo: null,
            where: "Frederick",
            distance: null,
            fact: "Likely open · check hours",
            confidence: "likely",
          },
        },
        serverRow,
        "county",
      );
      const confirmedLive = liveShelfFromWantAnswer(
        {
          ...unconfirmedAnswer("county"),
          hero: {
            slug: "late-bar",
            name: "Late Bar",
            photo: null,
            where: "Frederick",
            distance: null,
            fact: "Open until 1am",
            confidence: "confirmed",
          },
        },
        serverRow,
        "county",
      );
      expect(keepsServerDaypartShelf(serverRow, likelyLive, lateTuesday)).toBe(false);
      expect(keepsServerDaypartShelf(serverRow, confirmedLive, lateTuesday)).toBe(false);
    });
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

  it("states a tile's current hours and consented-device distance first", () => {
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

    expect(daypartTileFact(shelf.picks[0], shelf.contextSource)).toBe(
      "Open until 4pm · 4 min walk",
    );
  });

  it("shows distance only with a device fix and the town on a countywide shelf", () => {
    const pick = {
      slug: "nearby-only",
      name: "Nearby Only",
      rating: null,
      confidence: "confirmed" as const,
      fact: "Open until 10pm",
      where: "Brunswick",
      distance: "0.4 mi",
    };
    expect(daypartTileFact(pick, "device")).toBe("Open until 10pm · 0.4 mi");
    // A town centroid or IP origin is not the reader's own position, so its
    // distance would read as theirs. The town says where the place is.
    expect(daypartTileFact(pick, "ip")).toBe("Open until 10pm · Brunswick");
    expect(daypartTileFact(pick, "county")).toBe("Open until 10pm · Brunswick");
    // Inside a chosen town every pick shares the town, so only hours remain.
    expect(daypartTileFact(pick, "town")).toBe("Open until 10pm");
  });

  it("quotes a confirmed hours line and falls back to open now without one", () => {
    const confirmed = {
      slug: "nearby-only",
      name: "Nearby Only",
      rating: null,
      confidence: "confirmed" as const,
      decisionReasons: [
        { id: "review-evidence", label: "It has substantial Google review history.", evidenceIds: [] },
      ],
    };
    expect(daypartTileFact(confirmed, "town")).toBe("Open now");
    expect(daypartTileFact({ ...confirmed, fact: "Closing soon · 9:30pm" }, "town")).toBe(
      "Closing soon · 9:30pm",
    );
    expect(daypartTileFact({ ...confirmed, fact: "Open 24 hours" }, "town")).toBe(
      "Open 24 hours",
    );
  });

  it("never states curation, reviews or open when the hours are not confirmed", () => {
    // Today, Oct 6, 10:55 PM: "Why it leads: Radius has this marked as a
    // local favorite" sat under a bar whose hours were not confirmed. A tile
    // without hours evidence names only its town.
    const unconfirmed = {
      slug: "mcclintocks-back-bar",
      name: "McClintock's Back Bar",
      rating: null,
      confidence: "unconfirmed" as const,
      fact: "Hours not confirmed",
      where: "Frederick",
      decisionReasons: [
        { id: "local-favorite", label: "Radius has this marked as a local favorite.", evidenceIds: ["radius-curation"] },
        { id: "review-evidence", label: "It has substantial Google review history.", evidenceIds: ["google-places"] },
      ],
    };
    expect(daypartTileFact(unconfirmed)).toBe("Frederick");
    expect(daypartTileFact({ ...unconfirmed, distance: "4 min walk" }, "device")).toBe(
      "Frederick",
    );
    expect(daypartTileFact({ ...unconfirmed, where: null })).toBeNull();
  });

  it("says a likely pick is likely open and never prints its closing time", () => {
    const likely = {
      slug: "hootch-and-banter-frederick",
      name: "Hootch & Banter",
      rating: null,
      confidence: "likely" as const,
      fact: "Open until 2am",
      where: "Frederick",
      decisionReasons: [
        { id: "local-favorite", label: "Radius has this marked as a local favorite.", evidenceIds: ["radius-curation"] },
      ],
    };
    expect(daypartTileFact(likely, "town")).toBe("Likely open · check hours");
    expect(daypartTileFact(likely)).toBe("Likely open · check hours · Frederick");
    expect(daypartTileFact({ ...likely, distance: "4 min walk" }, "device")).toBe(
      "Likely open · check hours · 4 min walk",
    );
  });

  it("gives an opening-soon tile only its opening time, never an open claim", () => {
    const soon = {
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
      rating: 4.8,
      where: "Frederick",
      confidence: "confirmed" as const,
      fact: "Opens 8am",
    };
    expect(daypartTileFact(soon, "county", { openingSoon: true })).toBe(
      "Opens 8am · Frederick",
    );
    expect(daypartTileFact({ ...soon, fact: null }, "town", { openingSoon: true })).toBe(
      "Opening time available",
    );
  });

  it("drops the caps lead label and keeps each fact at the type floor", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        variant: "brief",
        rows: [
          {
            category: "bar",
            label: "Bars open late",
            href: "/category/bar",
            picks: [{
              slug: "late-bar",
              name: "Late Bar",
              rating: 4.6,
              where: "Frederick",
              confidence: "confirmed",
              fact: "Open until 1am",
            }],
          },
        ],
      }),
    );

    expect(html).not.toContain("Why it leads");
    expect(html).not.toContain("data-today-decision-reason");
    const fact = html.match(/<span data-today-pick-context[^>]*>[\s\S]*?<\/span>/)?.[0];
    expect(fact).toContain("Open until 1am · Frederick");
    expect(fact).toContain("text-meta-lg");
    expect(html).not.toMatch(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/);
    expect(html).not.toMatch(/uppercase/);
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
    // No photo: the flat category mark fills the same frame. Never initials,
    // a gradient, a rotated watermark glyph, or a map canvas.
    expect(withoutPhoto).toContain('data-radius-photo="mark"');
    expect(withoutPhoto).not.toContain("gradient");
    expect(withoutPhoto).not.toContain("rotate-");
    expect(withoutPhoto).not.toContain("maplibre");
    expect(withoutPhoto).toContain('data-today-place-lead="true"');
    // One pick is a single full-width tile with the larger 140px frame.
    expect(withoutPhoto).toContain('data-today-tile="single"');
    expect(withoutPhoto).toContain("height:140px");
    // A place name identifies the place, so it wraps to two lines instead of
    // clipping on one. "National Museum of Ci…" is not an answer.
    expect(withoutPhoto).toContain("text-title-sm line-clamp-2");
  });

  it("shows two picture tiles of the same size on the brief shelf", () => {
    const html = renderToStaticMarkup(
      createElement(DaypartNeeds, {
        variant: "brief",
        rows: [
          {
            category: "bar",
            label: "Bars open late",
            href: "/category/bar",
            picks: [
              {
                slug: "first-bar",
                name: "First Bar",
                rating: 4.6,
                photo: "/api/place-photo?name=places%2FChIJfirst%2Fphotos%2Ffront&w=800",
                where: "Frederick",
                confidence: "likely" as const,
              },
              {
                slug: "second-bar",
                name: "Second Bar",
                rating: 4.5,
                where: "Brunswick",
                confidence: "likely" as const,
              },
            ],
          },
        ],
      }),
    );

    expect(html.match(/data-today-tile="pair"/g)).toHaveLength(2);
    expect(
      html.match(/data-today-tile-frame="true" class="[^"]*" style="height:104px/g),
    ).toHaveLength(2);
    expect(html).toContain("grid-cols-2 gap-3");
    // The photo asks the proxy for its failure signal at the painted width.
    expect(html).toContain("fallback=signal");
    expect(html).toContain("w=400");
    // The second pick has no photo, so its frame holds the category mark.
    expect(html).toContain('data-radius-photo="mark"');
    expect(html).toContain("Likely open · check hours · Frederick");
    expect(html).toContain("Likely open · check hours · Brunswick");
    expect(html).not.toMatch(/until \d/);
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

  it("keeps the briefing variant to two answers with a route to every open place", () => {
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
    expect(html).toContain("Places open now");
    expect(html).toContain("Lead");
    expect(html).toContain("Second");
    expect(html).not.toContain("Third");
    expect(html).not.toContain("Opening Next");
    expect(html).not.toContain('role="tablist"');
    // The heading's one route goes to every open place.
    expect(html).toContain('href="/open-now"');
    expect(html).toContain("See all");
    expect(html).not.toContain('href="/category/coffee"');
    // No card inside a card: the tiles are links on the page, not boxes.
    expect(html).not.toContain("border bg-[var(--app-bg-elevated)]");
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
    // The shelf says once that the hours are unknown; the tile names its town.
    expect(html).toContain("Hours not confirmed · call ahead");
    expect(html).toMatch(/data-today-pick-context[^>]*>Frederick</);
    expect(html).not.toContain("Likely open");
    expect(html.match(/href="\/open-now"/g)).toHaveLength(1);
    expect(html).toContain("See all");
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
    // Three tiles: the first spans the row so no tile is stranded at half
    // width, and the transition keeps its own opening-soon identity.
    expect(html.match(/data-today-tile="single"/g)).toHaveLength(1);
    expect(html.match(/data-today-tile="pair"/g)).toHaveLength(2);
    expect(html).toContain('data-today-opening-soon="true"');
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
