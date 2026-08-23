import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { getIngestedSeries } from "./ingested";
import {
  getIngestedCardBySlug,
  IngestedEventDetailColdScanDisabledError,
  ingestedSeriesToCards,
} from "./ingestedEvents";

describe("multi-day all-day ingested visibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T16:00:00.000Z")); // noon ET, day two
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads an occurrence whose start is before the six-hour cutoff and keeps it on day two", async () => {
    const sql = vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        void strings;
        void values;
        return [
          {
            source_uid: "festival-1",
            source_domain: "fcvfra.com",
            source_url: "https://events.example/festival",
            title: "Summer Festival",
            description: "A two-day community festival.",
            starts_at_utc: "2026-07-10T04:00:00.000Z",
            ends_at_utc: "2026-07-12T04:00:00.000Z",
            all_day: true,
            venue_name: "Baker Park",
            address: "121 N Bentz St, Frederick, MD 21701",
            lat: "39.4143",
            lng: "-77.4200",
            municipality: "frederick",
            category: "community",
            hero_image: null,
            hero_image_alt: null,
            updated_at: "2026-07-11T10:30:00.000Z",
          },
        ];
      },
    );
    mocks.getSql.mockReturnValue(sql);

    const series = await getIngestedSeries();
    const query = (sql.mock.calls[0]?.[0] as unknown as TemplateStringsArray).join(" ");
    expect(query).toMatch(
      /where starts_at_utc >=\s+or ends_at_utc >=/,
    );

    const cards = ingestedSeriesToCards(series, new Date());
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Summer Festival",
      starts_at: "2026-07-10T04:00:00.000Z",
      ends_at: "2026-07-12T04:00:00.000Z",
      is_all_day: true,
      last_verified_at: "2026-07-11T10:30:00.000Z",
    });
  });

  it("carries an FCPL publisher image from the normalized row to the event card", async () => {
    const heroImage =
      "https://frederick.librarycalendar.com/sites/default/files/2026-07/art-class.jpg";
    mocks.getSql.mockReturnValue(
      vi.fn(async () => [
        {
          source_uid: "fcpl-art-1",
          source_domain: "frederick.librarycalendar.com",
          source_url:
            "https://frederick.librarycalendar.com/event/art-class-1",
          title: "Artist Adventures",
          description: "Create a colorful paper project.",
          starts_at_utc: "2026-07-12T18:00:00.000Z",
          ends_at_utc: "2026-07-12T19:00:00.000Z",
          all_day: false,
          venue_name: "C. Burr Artz Public Library",
          address: "110 E Patrick St, Frederick, MD 21701",
          lat: "39.4141",
          lng: "-77.4089",
          municipality: "frederick",
          category: "family",
          hero_image: heroImage,
          hero_image_alt: "Colorful paper art",
        },
      ]) as never,
    );

    const series = await getIngestedSeries();
    expect(series[0]).toMatchObject({
      heroImage,
      heroImageAlt: "Colorful paper art",
    });
    const cards = ingestedSeriesToCards(series, new Date());
    expect(cards[0]?.hero_image).toBe(heroImage);
    expect(cards[0]?.description).toBe(
      "Create a colorful paper project.",
    );
  });

  it("resolves a county live-feed slug from the stored official mirror", async () => {
    mocks.getSql.mockReturnValue(
      vi.fn(async () => [
        {
          source_uid: "14339",
          source_domain: "www.frederickcountymd.gov",
          source_url:
            "https://www.frederickcountymd.gov/calendar.aspx?EID=14339",
          title: "Ethics Commission Meeting",
          description: "The Frederick County Ethics Commission meets.",
          starts_at_utc: "2026-08-11T23:00:00.000Z",
          ends_at_utc: "2026-08-12T03:59:00.000Z",
          all_day: false,
          venue_name: "12 East Church Street, Winchester Room",
          address: "2nd Floor, Frederick, MD 21701",
          lat: null,
          lng: null,
          // CivicPlus stores a county label here rather than an app slug.
          municipality: "Frederick County",
          category: "Recreation Programs",
          hero_image: null,
          hero_image_alt: null,
        },
      ]) as never,
    );

    await expect(
      getIngestedCardBySlug(
        "ethics-commission-meeting-2026-08-11",
      ),
    ).resolves.toMatchObject({
      slug: "ethics-commission-meeting-2026-08-11",
      title: "Ethics Commission Meeting",
      source: "county",
      source_id: "14339",
      municipality: "county",
      municipality_name: "Frederick County",
      geo_confidence: "unknown",
      source_url:
        "https://www.frederickcountymd.gov/calendar.aspx?EID=14339",
    });
    const card = await getIngestedCardBySlug(
      "ethics-commission-meeting-2026-08-11",
    );
    expect(card?.geom).not.toEqual({ lng: -77.4105, lat: 39.4143 });
  });

  it("infers Frederick City only from a complete street-level county address", async () => {
    mocks.getSql.mockReturnValue(
      vi.fn(async () => [
        {
          source_uid: "14340",
          source_domain: "www.frederickcountymd.gov",
          source_url:
            "https://www.frederickcountymd.gov/calendar.aspx?EID=14340",
          title: "Planning Commission Hearing",
          description: "The commission meets for a public hearing.",
          starts_at_utc: "2026-08-13T23:00:00.000Z",
          ends_at_utc: "2026-08-14T01:00:00.000Z",
          all_day: false,
          venue_name: "County Office Building",
          address: "12 E Church St, Frederick, MD 21701",
          lat: null,
          lng: null,
          municipality: "Frederick County",
          category: "Public Meetings",
          hero_image: null,
          hero_image_alt: null,
        },
      ]) as never,
    );

    await expect(
      getIngestedCardBySlug(
        "planning-commission-hearing-2026-08-13",
      ),
    ).resolves.toMatchObject({
      municipality: "frederick",
      municipality_name: "Frederick City",
      geo_confidence: "unknown",
    });
  });

  it("does not start the countywide series scan on a dated detail request", async () => {
    const sql = vi.fn();
    mocks.getSql.mockReturnValue(sql);

    await expect(
      getIngestedCardBySlug("deaf-fest-2026-09-19", {
        allowSeriesScan: false,
      }),
    ).rejects.toBeInstanceOf(IngestedEventDetailColdScanDisabledError);
    await expect(
      getIngestedCardBySlug("library-movie-fcpl-20260919", {
        allowSeriesScan: false,
      }),
    ).rejects.toBeInstanceOf(IngestedEventDetailColdScanDisabledError);
    expect(sql).not.toHaveBeenCalled();
  });

  it("keeps an undated cold-scan miss definitive without touching the database", async () => {
    const sql = vi.fn();
    mocks.getSql.mockReturnValue(sql);

    await expect(
      getIngestedCardBySlug("not-a-published-event", {
        allowSeriesScan: false,
      }),
    ).resolves.toBeNull();
    await expect(
      getIngestedCardBySlug("not-a-published-event-2026-02-31", {
        allowSeriesScan: false,
      }),
    ).resolves.toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});
