import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import EventFlyerRail, {
  FLYER_RAIL_MAX,
  flyerRailItems,
  flyerRailWhen,
} from "./EventFlyerRail";

// Wednesday, October 7, 2026 at 9:21 PM Eastern, the evidence screenshot's clock.
const NOW = Date.parse("2026-10-07T21:21:00-04:00");

function flyer(slug: string, startsAt: string, overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  const start = Date.parse(startsAt);
  return {
    slug,
    title: `Event ${slug}`,
    description: "",
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + 2 * 3_600_000).toISOString(),
    timezone: "America/New_York",
    venue_name: "Weinberg Center for the Arts",
    address: "20 W Patrick St, Frederick, MD",
    geom: { lng: -77.41, lat: 39.414 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "dfp",
    source_url: `https://www.downtownfrederick.org/events/${slug}`,
    hero_image: `https://ik.imagekit.io/vibemap/events/${slug}.jpg`,
    is_verified: true,
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
    last_verified_at: "2026-10-07T12:00:00.000Z",
    ...overrides,
  } as EventWithMeta;
}

describe("flyerRailItems", () => {
  it("needs at least three flyers to make a rail", () => {
    const two = [
      flyer("a", "2026-10-08T19:30:00-04:00"),
      flyer("b", "2026-10-09T20:00:00-04:00"),
    ];
    expect(flyerRailItems(two, { nowMs: NOW })).toEqual([]);
    expect(
      flyerRailItems([...two, flyer("c", "2026-10-10T20:00:00-04:00")], { nowMs: NOW }),
    ).toHaveLength(3);
  });

  it("orders flyers by start and stops at six", () => {
    const events = [
      flyer("sun", "2026-10-11T13:00:00-04:00"),
      flyer("thu", "2026-10-08T19:30:00-04:00"),
      flyer("sat", "2026-10-10T20:00:00-04:00"),
      flyer("fri", "2026-10-09T20:00:00-04:00"),
      flyer("mon", "2026-10-12T18:00:00-04:00"),
      flyer("tue", "2026-10-13T18:00:00-04:00"),
      flyer("tue-late", "2026-10-13T21:00:00-04:00"),
    ];
    const items = flyerRailItems(events, { nowMs: NOW });
    expect(items.map((item) => item.event.slug)).toEqual([
      "thu", "fri", "sat", "sun", "mon", "tue",
    ]);
    expect(items).toHaveLength(FLYER_RAIL_MAX);
  });

  it("keeps only scheduled publisher flyers inside the ribbon's seven days", () => {
    const qualifying = [
      flyer("thu", "2026-10-08T19:30:00-04:00"),
      flyer("fri", "2026-10-09T20:00:00-04:00"),
      flyer("sat", "2026-10-10T20:00:00-04:00"),
    ];
    const items = flyerRailItems(
      [
        ...qualifying,
        // A venue photograph is not a flyer.
        flyer("venue-photo", "2026-10-08T18:00:00-04:00", {
          source: "manual",
          hero_image: undefined,
          venue_place_slug: "carroll-creek-linear-park-frederick",
        }),
        // A flyer on a host the publisher is not approved for.
        flyer("wrong-host", "2026-10-08T18:00:00-04:00", {
          hero_image: "https://example.com/flyer.jpg",
        }),
        flyer("cancelled", "2026-10-09T18:00:00-04:00", { status: "cancelled" }),
        flyer("council", "2026-10-09T18:00:00-04:00", {
          title: "Board of Aldermen meeting",
          category: "government",
        }),
        // Wednesday the 14th is past the ribbon's last day (Tuesday the 13th).
        flyer("next-week", "2026-10-14T19:30:00-04:00"),
      ],
      { nowMs: NOW },
    );
    expect(items.map((item) => item.event.slug)).toEqual(["thu", "fri", "sat"]);
  });

  it("shows one card per flyer image so a weekly series cannot fill the rail", () => {
    const series = (slug: string, startsAt: string) =>
      flyer(slug, startsAt, {
        hero_image: "https://ik.imagekit.io/vibemap/events/trivia.jpg",
      });
    const items = flyerRailItems(
      [
        series("trivia-1", "2026-10-08T19:00:00-04:00"),
        series("trivia-2", "2026-10-09T19:00:00-04:00"),
        flyer("fri", "2026-10-09T20:00:00-04:00"),
        flyer("sat", "2026-10-10T20:00:00-04:00"),
      ],
      { nowMs: NOW },
    );
    expect(items.map((item) => item.event.slug)).toEqual(["trivia-1", "fri", "sat"]);
  });
});

describe("flyerRailWhen", () => {
  it("reads as weekday, date and start time", () => {
    expect(flyerRailWhen(flyer("thu", "2026-10-08T19:30:00-04:00"))).toBe(
      "Thu, Oct 8 · 7:30 PM",
    );
  });
});

describe("EventFlyerRail", () => {
  const items = flyerRailItems(
    [
      flyer("thu", "2026-10-08T19:30:00-04:00"),
      flyer("fri", "2026-10-09T20:00:00-04:00"),
      flyer("sat", "2026-10-10T20:00:00-04:00"),
    ],
    { nowMs: NOW },
  );

  it("renders nothing below three flyers", () => {
    expect(renderToStaticMarkup(<EventFlyerRail items={items.slice(0, 2)} />)).toBe("");
  });

  it("titles the rail without a count and links each card once", () => {
    const html = renderToStaticMarkup(<EventFlyerRail items={items} />);
    expect(html).toContain(">This week<");
    expect(html).not.toMatch(/This week[^<]*\d/);
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain('href="/events/thu"');
    expect(html).toContain("Thu, Oct 8 · 7:30 PM");
    expect(html).toContain("Weinberg Center for the Arts · Frederick");
  });

  it("shows each flyer uncropped with nothing on it, and no credit before it loads", () => {
    const html = renderToStaticMarkup(<EventFlyerRail items={items} />);
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).toContain('alt=""');
    expect(html).toContain("h-[124px] w-[200px]");
    expect(html).not.toContain("Event image");
    expect(html).not.toMatch(/\bwhole\b/i);
  });
});
