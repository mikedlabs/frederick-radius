import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DaypartNeeds, {
  DaypartEmptyState,
  daypartBrowseHref,
  daypartPhotoSrc,
  daypartPickScopeLabel,
  isPhotoFailureSignal,
  isDaypartCountywideContext,
  liveShelfFromWantAnswer,
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
    expect(html).toContain("Countywide picks");
    expect(html).toContain("Urbana");
    expect(html).not.toContain("Nearby picks");
    expect(html).not.toContain("Right now, around here");
    expect(html).not.toContain("Second Loaf");
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
      "No place across Frederick County has current hours showing it open.",
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
      "No place in Urbana has current hours showing it open.",
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

    expect(html).toContain("No place is open in Urbana right now.");
    expect(html).not.toContain("hours showing it open");
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
    expect(html).toContain("Likely Cup, likely open");
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
    expect(withoutPhoto).toContain('class="h-5 w-5"');
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
