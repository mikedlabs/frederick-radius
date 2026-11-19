import { describe, expect, it } from "vitest";
import { buildHorizonBounds } from "@/lib/eventHorizon";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventMatchesHighlightWeekend, eventMatchesTonight, selectEventHighlights } from "./highlights";

const thursday = new Date("2026-11-19T13:00:00-05:00");
const bounds = buildHorizonBounds(thursday);

function show(slug: string, starts_at: string, ends_at: string, overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug, title: slug, starts_at, ends_at, description: "", timezone: "America/New_York",
    venue_name: "Test venue", address: "10 Main St", municipality: "frederick",
    geom: { lng: -77.41, lat: 39.41 }, category: "music", audience: [], is_free: false,
    source: "seed", source_id: slug, source_url: "https://example.org/show", is_verified: true,
    license: "test", confidence: "curated", first_seen_at: thursday.toISOString(),
    last_verified_at: thursday.toISOString(), geo_confidence: "venue_match",
    municipality_name: "Frederick", category_name: "Music", ...overrides,
  };
}

const late = show("night-music", "2026-11-20T03:00:00Z", "2026-11-20T04:30:00Z");
const saturday = show("park-music", "2026-11-21T19:00:00-05:00", "2026-11-21T21:00:00-05:00");

describe("Tonight in Frederick", () => {
  it("includes an evening after UTC midnight and stops at the following Eastern midnight", () => {
    expect(eventMatchesTonight(late, thursday)).toBe(true);
    expect(eventMatchesTonight(show("midnight", "2026-11-20T00:00:00-05:00", ""), thursday)).toBe(false);
  });

  it("includes an explicit afternoon performance running into the evening, until its end", () => {
    const matinee = show("matinee", "2026-11-19T15:00:00-05:00", "2026-11-19T19:00:00-05:00");
    expect(eventMatchesTonight(matinee, thursday)).toBe(true);
    expect(eventMatchesTonight(matinee, new Date("2026-11-19T18:00:00-05:00"))).toBe(true);
    expect(eventMatchesTonight(matinee, new Date(matinee.ends_at))).toBe(false);
    expect(eventMatchesTonight({ ...matinee, ends_at: "2026-11-19T16:00:00-05:00" }, thursday)).toBe(false);
  });

  it("honors a future start without inventing an end or still-running status", () => {
    const showtime = { ...late, ends_at: late.starts_at };
    expect(eventMatchesTonight(showtime, thursday)).toBe(true);
    expect(eventMatchesTonight(showtime, new Date("2026-11-20T03:30:00Z"))).toBe(false);
  });

  it("excludes all-day listings, calendar anchors and long generic schedule containers", () => {
    const noon = "2026-11-19T12:00:00-05:00";
    for (const candidate of [
      { ...late, is_all_day: true },
      show("date-only", noon, "2026-11-19T23:59:00-05:00"),
      show("general hours", "2026-11-19T09:00:00-05:00", "2026-11-19T20:00:00-05:00"),
      show("exhibit", noon, "2026-12-19T19:00:00-05:00"),
    ]) expect(eventMatchesTonight(candidate, thursday)).toBe(false);
  });
});

describe("This weekend in Frederick", () => {
  it("uses actual overlap with Friday 5 pm and excludes the Monday edge", () => {
    const friday = show("afternoon", "2026-11-20T16:00:00-05:00", "2026-11-20T17:00:00-05:00");
    expect(eventMatchesHighlightWeekend(friday, bounds)).toBe(false);
    expect(eventMatchesHighlightWeekend({ ...friday, ends_at: "2026-11-20T18:00:00-05:00" }, bounds)).toBe(true);
    expect(eventMatchesHighlightWeekend({ ...friday, ends_at: "" }, bounds)).toBe(false);
    expect(eventMatchesHighlightWeekend(show("Monday", "2026-11-23T00:00:00-05:00", ""), bounds)).toBe(false);
  });

  it("allows Saturday/Sunday date-only listings without inferring a Friday evening session", () => {
    const anchor = (date: string) => show("date only", date + "T12:00:00-05:00", date + "T23:59:00-05:00");
    expect(eventMatchesHighlightWeekend(anchor("2026-11-20"), bounds)).toBe(false);
    expect(eventMatchesHighlightWeekend(anchor("2026-11-21"), bounds)).toBe(true);
    const friday = show("weekend fair", "2026-11-20T00:00:00-05:00", "2026-11-21T00:00:00-05:00", { is_all_day: true });
    expect(eventMatchesHighlightWeekend(friday, bounds)).toBe(false);
    expect(eventMatchesHighlightWeekend({ ...friday, ends_at: "2026-11-23T00:00:00-05:00" }, bounds)).toBe(true);
    expect(eventMatchesHighlightWeekend({ ...saturday, is_all_day: true, ends_at: "" }, bounds)).toBe(true);
    expect(eventMatchesHighlightWeekend({ ...saturday, is_all_day: true, ends_at: "2027-01-01T00:00:00-05:00" }, bounds)).toBe(false);
  });

  it("keeps both fall-back hours in the same weekend and drops ended or unconfirmed ongoing rows", () => {
    const clock = buildHorizonBounds(new Date("2026-11-01T01:40:00-04:00"));
    const first = show("first set", "2026-11-01T01:00:00-04:00", "2026-11-01T01:30:00-04:00");
    const second = show("second set", "2026-11-01T01:00:00-05:00", "");
    expect(eventMatchesHighlightWeekend(first, clock)).toBe(false);
    expect(eventMatchesHighlightWeekend({ ...first, ends_at: "" }, clock)).toBe(false);
    expect(eventMatchesHighlightWeekend(second, clock)).toBe(true);
    expect(eventMatchesHighlightWeekend({ ...second, starts_at: "2026-11-02T00:00:00-05:00" }, clock)).toBe(false);
  });
});

describe("the Events overview", () => {
  it("returns one occurrence once on a weekend and distinguishes overlap from an empty weekend", () => {
    const current = buildHorizonBounds(new Date("2026-11-21T16:00:00-05:00"));
    const duplicate = { ...saturday, starts_at: "2026-11-22T00:00:00Z" };
    expect(selectEventHighlights([saturday, duplicate], current)).toEqual({
      tonight: [saturday], weekend: [], weekendIncludesTonight: true,
    });
    expect(selectEventHighlights([late], bounds)).toEqual({ tonight: [late], weekend: [], weekendIncludesTonight: false });
  });

  it("keeps a distinct later showing with the same event slug", () => {
    const repeat = { ...saturday, slug: late.slug };
    expect(selectEventHighlights([late, repeat], bounds)).toEqual({
      tonight: [late], weekend: [repeat], weekendIncludesTonight: false,
    });
  });

  it("keeps cancellations, private events, meetings and online listings without a joining link out", () => {
    const unavailable = [
      { ...late, status: "cancelled" as const },
      { ...late, title: "Private party" },
      { ...late, title: "City Council meeting" },
      { ...late, attendance_mode: "online" as const, source_url: "https://example.org/calendar.ics" },
    ];
    expect(selectEventHighlights(unavailable, bounds).tonight).toEqual([]);
  });

  it("favors an exact venue photo over a held proxy, retains editorial picks and breaks ties consistently", () => {
    const held = { ...late, slug: "a", hero_image: "/api/place-photo?name=held" };
    const noPhoto = { ...late, slug: "b" };
    const venue = { ...late, slug: "c", venue_place_slug: "mccurdy-field", venue_name: "McCurdy Field" };
    expect(selectEventHighlights([held, venue, noPhoto], bounds).tonight).toEqual([venue]);
    expect(selectEventHighlights([held, venue, noPhoto], bounds, new Set(["b"])).tonight).toEqual([noPhoto]);
    expect(selectEventHighlights([noPhoto, held], bounds).tonight).toEqual([held]);
    expect(selectEventHighlights([held, noPhoto], bounds).tonight).toEqual([held]);
  });
});
