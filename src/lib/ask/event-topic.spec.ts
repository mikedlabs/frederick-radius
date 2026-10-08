import { describe, it, expect } from "vitest";
import { eventMatchesTopic } from "@/lib/ask/answer";
import type { Event } from "@/data/events";

// eventMatchesTopic only reads title, description, category, and venue_name,
// so a minimal fixture is enough (cast past the full Event shape on purpose).
function event(overrides: Partial<Event>): Event {
  return {
    slug: "e1",
    title: "Untitled",
    description: "",
    category: "arts",
    venue_name: "",
    ...overrides,
  } as Event;
}

describe("eventMatchesTopic — movies", () => {
  const vinylNight = event({ title: "Bring Your Own Vinyl", category: "music" });
  const volleyball = event({ title: "Adult Volleyball League", category: "sports" });
  const foodTruck = event({ title: "Food Truck Friday", category: "food" });
  const libraryScreening = event({
    title: "Family Movie Night: screening in the community room",
    category: "family",
  });

  it.each(["movies tonight", "movies", "showtimes", "matinee", "cinema"])(
    "keeps unrelated evening events out of a '%s' answer",
    (query) => {
      expect(eventMatchesTopic(vinylNight, query)).toBe(false);
      expect(eventMatchesTopic(volleyball, query)).toBe(false);
      expect(eventMatchesTopic(foodTruck, query)).toBe(false);
    },
  );

  it("still admits a genuinely film-related event for a movie ask", () => {
    expect(eventMatchesTopic(libraryScreening, "movies tonight")).toBe(true);
  });

  it("does not change non-movie topic queries", () => {
    // A live-music ask still admits the music event; a plain ask still admits all.
    expect(eventMatchesTopic(vinylNight, "live music tonight")).toBe(true);
    expect(eventMatchesTopic(volleyball, "what's happening tonight")).toBe(true);
  });

  it("routes a film festival to the festival topic, not the movie filter", () => {
    const filmFest = event({ title: "Frederick Film Festival", category: "arts" });
    expect(eventMatchesTopic(filmFest, "film festival")).toBe(true);
  });
});
