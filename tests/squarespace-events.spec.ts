import { describe, it, expect } from "vitest";
import {
  fetchSquarespaceEventsResult,
  parseSquarespaceEvents,
} from "../scripts/lib/extract-agent";

// Fixture modeled on the real Squarespace `?format=json` response from
// thebanyanmd.com/livemusic (verified May 2026): an `upcoming` array of
// items with title, startDate/endDate as millisecond epoch integers,
// an HTML excerpt, and a relative fullUrl. No live network here.
const banyanLike = {
  upcoming: [
    {
      id: "abc123",
      recordType: 12,
      title: "Jimmy Kenny and The Pirate Beach Band",
      startDate: 1780794000999, // 2026-06-06T...Z
      endDate: 1780808400000,
      excerpt: "<p>Trop-rock on the rooftop.</p>",
      fullUrl: "/livemusic/jimmy-kenny-and-the-pirate-beach-band",
    },
    {
      title: "Radio Hero",
      startDate: 1781312400842,
      endDate: 1781326800000,
      excerpt: "",
      fullUrl: "/livemusic/radio-hero",
    },
  ],
  past: [
    { title: "Old Show", startDate: 1700000000000, fullUrl: "/livemusic/old" },
  ],
};

describe("parseSquarespaceEvents", () => {
  it("parses upcoming events with ISO dates and absolute ticket URLs", () => {
    const events = parseSquarespaceEvents(banyanLike, "https://www.thebanyanmd.com/livemusic");
    expect(events).toHaveLength(2);

    const [first] = events;
    expect(first.title).toBe("Jimmy Kenny and The Pirate Beach Band");
    expect(first.starts_at).toBe(new Date(1780794000999).toISOString());
    expect(first.ends_at).toBe(new Date(1780808400000).toISOString());
    // HTML excerpt is stripped to one plain line.
    expect(first.description).toBe("Trop-rock on the rooftop.");
    expect(first.description_origin).toBe("source-excerpt");
    // Relative fullUrl is resolved against the site origin.
    expect(first.ticket_url).toBe(
      "https://www.thebanyanmd.com/livemusic/jimmy-kenny-and-the-pirate-beach-band",
    );
  });

  it("ignores the `past` array entirely", () => {
    const events = parseSquarespaceEvents(banyanLike, "https://www.thebanyanmd.com/livemusic");
    expect(events.some((e) => e.title === "Old Show")).toBe(false);
  });

  it("omits an empty excerpt rather than emitting a blank description", () => {
    const events = parseSquarespaceEvents(banyanLike, "https://www.thebanyanmd.com");
    const radio = events.find((e) => e.title === "Radio Hero");
    expect(radio).toBeDefined();
    expect(radio?.description).toBeUndefined();
  });

  it("does not cut a publisher excerpt in the middle of a later sentence", () => {
    const firstSentence = "This complete publisher sentence stays intact. ";
    const longTail = "The next sentence keeps going with more source detail. ".repeat(8);
    const events = parseSquarespaceEvents(
      {
        upcoming: [
          {
            title: "Long excerpt",
            startDate: 1780794000999,
            excerpt: `<p>${firstSentence}${longTail}</p>`,
          },
        ],
      },
      "https://example.com/events",
    );

    expect(events[0].description).toMatch(/[.!?…]$/);
    expect(events[0].description).not.toMatch(/source det$/);
    expect(events[0].description_origin).toBe("source-excerpt");
  });

  it("never fabricates: drops items missing a title or a numeric startDate", () => {
    const dirty = {
      upcoming: [
        { title: "", startDate: 1780794000999 }, // no title
        { title: "No Date", startDate: "soon" }, // non-numeric date
        { title: "Good", startDate: 1780794000999 },
      ],
    };
    const events = parseSquarespaceEvents(dirty, "https://example.com");
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Good");
  });

  it("returns [] for a non-Squarespace / malformed payload", () => {
    expect(parseSquarespaceEvents(null)).toEqual([]);
    expect(parseSquarespaceEvents({})).toEqual([]);
    expect(parseSquarespaceEvents({ upcoming: "nope" })).toEqual([]);
    expect(parseSquarespaceEvents("<html>")).toEqual([]);
  });

  it("keeps the relative URL when no base origin is given", () => {
    const events = parseSquarespaceEvents(banyanLike);
    expect(events[0].ticket_url).toBe("/livemusic/jimmy-kenny-and-the-pirate-beach-band");
  });
});

describe("fetchSquarespaceEventsResult", () => {
  it("distinguishes a verified empty feed from a failed request", async () => {
    const empty = await fetchSquarespaceEventsResult(
      "https://example.com/events",
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ upcoming: [] }), { status: 200 }),
      },
    );
    const failed = await fetchSquarespaceEventsResult(
      "https://example.com/events",
      {
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
      },
    );

    expect(empty).toEqual({ status: "success", events: [] });
    expect(failed).toEqual({ status: "failure", events: [] });
  });

  it("does not call a malformed non-empty feed a successful empty result", async () => {
    const result = await fetchSquarespaceEventsResult(
      "https://example.com/events",
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ upcoming: [{ title: "Missing date" }] }),
            { status: 200 },
          ),
      },
    );

    expect(result).toEqual({ status: "failure", events: [] });
  });
});
