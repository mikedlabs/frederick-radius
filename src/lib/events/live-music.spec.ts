import { describe, it, expect } from "vitest";
import { isLiveMusicEvent, isNonMusicTitle } from "./live-music";
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

  it("rejects events at non-music venues without a music category", () => {
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: "some-restaurant", title: "Band Night" })).toBe(false);
    expect(isLiveMusicEvent({ category: "food", venue_place_slug: undefined, title: "Band Night" })).toBe(false);
  });
});
