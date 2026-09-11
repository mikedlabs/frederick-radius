import { describe, it, expect } from "vitest";
import {
  inferredNonMusicCategory,
  isLiveMusicEvent,
  isNonMusicTitle,
  liveMusicAhead,
} from "./live-music";
import { LIVE_MUSIC_VENUE_SLUGS } from "@/data/live-music-venues";

// A real verified music venue from the curated set, so the test exercises
// the actual join (and fails loudly if the slug is ever removed).
const VENUE = "bentztown";

describe("isLiveMusicEvent", () => {
  it("uses a real venue slug from the curated set", () => {
    expect(LIVE_MUSIC_VENUE_SLUGS.has(VENUE)).toBe(true);
  });

  it("accepts classified music/concert events regardless of venue", () => {
    expect(isLiveMusicEvent({ category: "music", venue_place_slug: undefined, title: "Friday Show" })).toBe(true);
    expect(isLiveMusicEvent({ category: "concert", venue_place_slug: undefined, title: "Symphony" })).toBe(true);
  });

  it("accepts a music-venue event with a show-like title (the join's purpose)", () => {
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: VENUE, title: "The Plate Scrapers (live)" })).toBe(true);
  });

  it("rejects non-music events at a music venue: the join needs MUSIC intent", () => {
    for (const title of [
      "Yoga in the Taproom",
      "Trivia Night",
      "Bingo!",
      "Paint & Sip",
      "Painting with a Twist",
      "Tuesday Run Club",
      "Book Club: July",
    ]) {
      expect(isLiveMusicEvent({ category: "food", venue_place_slug: VENUE, title })).toBe(false);
    }
  });

  it("a classified music event keeps its word even with a tricky title", () => {
    // The category is the stronger signal; the title heuristic only gates
    // the venue join.
    expect(isLiveMusicEvent({ category: "music", venue_place_slug: VENUE, title: "Yoga Pants: 90s cover band" })).toBe(true);
  });

  it("exports the title gate for the venue-feed ingest boundaries", () => {
    // squarespace-live + venueEvents use this to stop blanket-stamping
    // category "music" on every item of a music venue's calendar.
    expect(isNonMusicTitle("Yoga in the Taproom")).toBe(true);
    expect(isNonMusicTitle("Bluegrass Jam")).toBe(false);
  });

  it("classifies unmistakable market listings without calling them music", () => {
    expect(inferredNonMusicCategory("Vintage Flea Market")).toBe("market");
    expect(inferredNonMusicCategory("Holiday Market")).toBe("market");
    expect(isNonMusicTitle("Vintage Flea Market")).toBe(true);
    expect(inferredNonMusicCategory("Trivia Night")).toBe("community");
    expect(inferredNonMusicCategory("Market Street Band")).toBeNull();
    expect(
      isLiveMusicEvent({
        category: "music",
        venue_place_slug: VENUE,
        title: "Vintage Flea Market",
      }),
    ).toBe(false);
  });

  it("rejects events at non-music venues without a music category", () => {
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: "some-restaurant", title: "Band Night" })).toBe(false);
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: undefined, title: "Band Night" })).toBe(false);
  });
});

describe("liveMusicAhead", () => {
  // Friday 2026-07-17 18:00 ET = 22:00 UTC (EDT).
  const now = new Date("2026-07-17T22:00:00.000Z");
  const show = (slug: string, starts_at: string, category = "music") =>
    ({ slug, title: `${slug} live`, category, starts_at, venue_place_slug: undefined }) as never;

  it("starts after tonight's window and stops at the horizon, soonest first", () => {
    const pool = [
      show("tonight", "2026-07-17T23:30:00.000Z"), // inside tonight's window
      show("next-week", "2026-07-24T23:00:00.000Z"),
      show("tomorrow", "2026-07-19T00:00:00.000Z"),
      show("past-horizon", "2026-09-01T23:00:00.000Z"),
    ];
    const out = liveMusicAhead(pool, now, 28).map((e) => e.slug);
    expect(out).toEqual(["tomorrow", "next-week"]);
  });

  it("applies the same live-music filter as tonight", () => {
    const pool = [show("food-thing", "2026-07-24T23:00:00.000Z", "food")];
    expect(liveMusicAhead(pool, now, 28)).toEqual([]);
  });
});

describe("isLiveMusicEvent fitness/class veto (2026-07-17 radar screenshot)", () => {
  it("rejects fitness classes and comedy on a music venue's calendar", () => {
    for (const title of [
      "Dance Fitness with Monique",
      "Pups and Poses",
      "Cardio Sculpt",
      "Senior Exercise",
      "Learn to Salsa Dance",
      "Next Stop Comedy",
    ]) {
      expect(isLiveMusicEvent({ category: "food", venue_place_slug: VENUE, title })).toBe(false);
    }
  });

  it("keeps a real dance party and real shows", () => {
    expect(isLiveMusicEvent({ category: "music", venue_place_slug: undefined, title: "Salsa Night Dance Party! Carnaval De La Salsa" })).toBe(true);
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: VENUE, title: "Michelle & Jason Hannon" })).toBe(true);
  });
});
