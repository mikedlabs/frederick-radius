import { describe, expect, it, vi } from "vitest";
import type { Event } from "@/data/events";
import type { SourceConfidence } from "@/lib/provenance";
import { eventCardVisual, parseRecoveryEventVisual } from "@/components/event/eventVisuals";
import {
  isStrongTodayEvent,
  selectTodayEvents,
  shouldRenderTodayEventSection,
  todayEventPicksMeta,
  type TodayEventCandidate,
} from "./today-events";

const now = new Date("2026-07-16T17:45:00.000Z"); // 1:45 PM Eastern

function event(overrides: Partial<Event> & { confidence?: SourceConfidence } & Pick<Event, "slug" | "title">): Event & { confidence: SourceConfidence } {
  const { slug, title, ...rest } = overrides;
  return {
    slug,
    title,
    description: "A real local event.",
    starts_at: "2026-07-16T23:00:00.000Z",
    ends_at: "2026-07-17T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "A real venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    confidence: "curated",
    source_url: "https://www.cityoffrederickmd.gov/calendar/event-control",
    last_verified_at: "2026-07-16T15:00:00.000Z",
    ...rest,
  };
}

describe("Today event shortlist", () => {
  it("labels briefing counts as picks instead of calendar totals", () => {
    expect(todayEventPicksMeta({
      todayPicks: 1,
      tonightPicks: 1,
      degraded: true,
    })).toBe(
      "1 event pick today · 1 event pick tonight · Countywide · Partial coverage",
    );
    expect(todayEventPicksMeta({
      todayPicks: 3,
      tonightPicks: 2,
      degraded: false,
    })).toBe("3 event picks today · 2 event picks tonight · Countywide");
    expect(todayEventPicksMeta({
      todayPicks: 0,
      tonightPicks: 0,
      degraded: true,
    })).toBe("Partial calendar coverage");
  });

  it("rejects the bad all-day nighttime label and venue-less noise", () => {
    expect(isStrongTodayEvent(event({
      slug: "night-bingo",
      title: "Thursday Night Bingo",
      is_all_day: true,
      starts_at: "2026-07-16T04:00:00.000Z",
      ends_at: "2026-07-17T03:59:00.000Z",
    }), now)).toBe(false);
    expect(isStrongTodayEvent(event({
      slug: "mystery-act",
      title: "Mystery Act",
      venue_name: "",
    }), now)).toBe(false);
  });

  it("builds a useful now, later, tonight sequence", () => {
    const result = selectTodayEvents([
      event({ slug: "live", title: "Lunch Concert", starts_at: "2026-07-16T17:00:00.000Z", ends_at: "2026-07-16T18:30:00.000Z" }),
      event({ slug: "later", title: "Afternoon Art", starts_at: "2026-07-16T19:00:00.000Z", ends_at: "2026-07-16T20:00:00.000Z", category: "arts" }),
      event({ slug: "tonight", title: "Evening Concert", starts_at: "2026-07-16T23:00:00.000Z", ends_at: "2026-07-17T01:00:00.000Z" }),
    ], now);
    expect(result.map((item) => item.moment)).toEqual(["Now", "Later", "Tonight"]);
  });

  it("trusts an official publisher row without pretending Radius verified it", () => {
    const official = event({
      slug: "library-concert",
      title: "Library Concert",
      source: "fcpl",
      confidence: "verified",
      is_verified: false,
    });
    const aggregator = event({
      slug: "unknown-feed-concert",
      title: "Unknown Feed Concert",
      source: "eventbrite",
      confidence: "scraped",
      is_verified: false,
    });

    expect(isStrongTodayEvent(official, now)).toBe(true);
    expect(official.is_verified).toBe(false);
    expect(isStrongTodayEvent(aggregator, now)).toBe(false);
  });

  it.each(["Frederick", "Frederick County", "Downtown Frederick", "Off Campus", "TBD"])(
    "keeps unresolved destination %s out of the prime brief",
    (venue_name) => {
      expect(selectTodayEvents([event({ slug: "unresolved-draw", title: "Community concert", venue_name })], now)).toEqual([]);
    },
  );

  it.each([
    { label: "missing check", last_verified_at: null },
    { label: "stale check", last_verified_at: "2026-07-15T17:44:59.000Z" },
    { label: "future check", last_verified_at: "2026-07-16T17:51:00.000Z" },
  ])("requires fresh source evidence: $label", ({ last_verified_at }) => {
    expect(selectTodayEvents([event({ slug: "unchecked-draw", title: "Community concert", last_verified_at })], now)).toEqual([]);
  });

  it("requires an actual source page even for a recognized publisher", () => {
    expect(selectTodayEvents([event({ slug: "source-less-draw", title: "Community concert", source: "fcpl", source_url: null })], now)).toEqual([]);
  });

  it("preserves a supplied presenter without inventing an event title", () => {
    const production = event({ slug: "theatre-draw", title: "Live Theatre Production" });
    expect(selectTodayEvents([production], now)[0]?.title).toBe("Live Theatre Production");
    const presented = { ...production, presenter: "Other Voices Theatre" };
    expect(selectTodayEvents([presented], now)[0]).toMatchObject({
      slug: presented.slug,
      title: "Live Theatre Production",
      presenter: "Other Voices Theatre",
      venue: "A real venue",
    });
    expect(presented.title).toBe("Live Theatre Production");
    expect(presented.presenter).toBe("Other Voices Theatre");
  });

  it("keeps actionable online events and labels their attendance honestly", () => {
    const online = event({ slug: "online-draw", title: "A local history conversation", venue_name: "", attendance_mode: "online", online_url: "https://example.test/join/local-history" });
    expect(selectTodayEvents([online], now)[0]).toMatchObject({ slug: online.slug, venue: "Online" });
    expect(selectTodayEvents([{ ...online, online_url: undefined, source_url: "https://example.test/calendar.ics" }], now)).toEqual([]);
  });

  it("hides an empty degraded section but keeps trustworthy empty-day copy", () => {
    expect(shouldRenderTodayEventSection({
      degraded: true,
      featurePromoted: false,
      programCount: 0,
      earlierCount: 0,
    })).toBe(false);
    expect(shouldRenderTodayEventSection({
      degraded: false,
      featurePromoted: false,
      programCount: 0,
      earlierCount: 0,
    })).toBe(true);
    expect(shouldRenderTodayEventSection({
      degraded: true,
      featurePromoted: false,
      programCount: 1,
      earlierCount: 0,
    })).toBe(true);
  });
});


describe("Today first-pick visual resolution", () => {
  function live(patch: Partial<TodayEventCandidate> = {}) {
    return event({ slug: "live-choice", title: "Community concert", presenter: "Supplied presenter",
      starts_at: "2026-07-16T17:00:00.000Z", ends_at: "2026-07-16T18:30:00.000Z", ...patch });
  }

  it("resolves only the selected first source record after eligibility, ordering and limiting", () => {
    const first = Object.freeze(live({ venue_place_slug: "baker-park-bandshell" }));
    const later = Object.freeze(event({ slug: "later-choice", title: "Evening concert",
      venue_place_slug: "carroll-creek-linear-park-frederick", ticket_url: "https://example.test/tickets/evening" }));
    const rejected = Object.freeze(event({ slug: "unchecked-decoy", title: "Unverified concert",
      last_verified_at: null, hero_image: "https://s1.ticketm.net/dam/a/decoy.jpg" }));
    const pool = Object.freeze([later, rejected, first]);
    const before = JSON.stringify(pool);
    const baseline = selectTodayEvents(pool, now, 2);
    const visual = eventCardVisual(first, { venuePhotos: "owned-only" })!;
    const resolveVisual = vi.fn<(source: TodayEventCandidate) => typeof visual>(() => visual);
    const selected = selectTodayEvents(pool, now, 2, resolveVisual);
    expect(selected.map(row => row.slug)).toEqual([first.slug, later.slug]);
    expect(selected[0]).toEqual({ ...baseline[0], visual });
    expect(selected[1]).toEqual(baseline[1]);
    expect(resolveVisual).toHaveBeenCalledTimes(1);
    expect(resolveVisual.mock.calls[0][0]).toBe(first);
    expect(selected[0]).toMatchObject({ title: first.title, presenter: first.presenter, visual });
    expect(selected[1]).not.toHaveProperty("visual");
    expect(JSON.stringify(pool)).toBe(before);
  });

  it("does not search later choices for an image or promote their image onto a photo-less first choice", () => {
    const first = live();
    const later = event({ slug: "illustrated-later-choice", title: "Evening concert", venue_place_slug: "baker-park-bandshell" });
    const resolveVisual = vi.fn((source: TodayEventCandidate) =>
      parseRecoveryEventVisual(eventCardVisual(source, { venuePhotos: "owned-only" })));
    const selected = selectTodayEvents([later, first], now, 3, resolveVisual);
    expect(selected.map(row => row.slug)).toEqual([first.slug, later.slug]);
    expect(resolveVisual).toHaveBeenCalledTimes(1);
    expect(resolveVisual.mock.calls[0][0]).toBe(first);
    expect(selected.every(row => row.visual === undefined)).toBe(true);
    expect(eventCardVisual(later, { venuePhotos: "owned-only" })).not.toBeNull();
  });

  it("keeps factual choices and canonical identity when the optional resolver throws", () => {
    const first = Object.freeze(live());
    const later = Object.freeze(event({ slug: "later-choice", title: "Evening concert" }));
    const pool = Object.freeze([later, first]);
    const baseline = selectTodayEvents(pool, now);
    const resolveVisual = vi.fn<(source: TodayEventCandidate) => never>(() => { throw new Error("Optional visual unavailable"); });
    expect(selectTodayEvents(pool, now, 3, resolveVisual)).toEqual(baseline);
    expect(resolveVisual).toHaveBeenCalledTimes(1);
    expect(resolveVisual.mock.calls[0][0]).toBe(first);
    expect(first.title).toBe("Community concert");
    expect(first.presenter).toBe("Supplied presenter");
  });

  it("does no visual work when no event survives selection or the requested result limit is zero", () => {
    const resolveVisual = vi.fn<(source: TodayEventCandidate) => null>(() => null);
    expect(selectTodayEvents([], now, 3, resolveVisual)).toEqual([]);
    expect(selectTodayEvents([live({ last_verified_at: null })], now, 3, resolveVisual)).toEqual([]);
    expect(selectTodayEvents([live()], now, 0, resolveVisual)).toEqual([]);
    expect(resolveVisual).not.toHaveBeenCalled();
  });
});
