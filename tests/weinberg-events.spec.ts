import { describe, expect, it, vi } from "vitest";
import {
  fetchWeinbergEventsResult,
  parseWeinbergEventPage,
} from "../scripts/lib/weinberg-events";

const SOURCE = "https://weinbergcenter.org/performances/";

function card(
  title: string,
  date: string,
  time: string,
  slug: string,
): string {
  return `
    <article class="js-post" data-found-posts="3">
      <a href="https://weinbergcenter.org/shows/${slug}/">
        <h4 class="show-title">${title}</h4>
      </a>
      <div class="performance">
        <p class="show-date">${date}</p>
        <p class="show-time">${time}</p>
      </div>
    </article>`;
}

function page(found: number, cards: string): string {
  return `<span id="query-info" data-found-posts="${found}"></span>${cards}`;
}

function landing(pageSize = 2): string {
  const placeholders = Array.from(
    { length: pageSize },
    (_, index) => `<article class="js-post" data-index="${index}"></article>`,
  ).join("");
  return `
    <div class="js-post-container" data-post-type="shows">${placeholders}</div>
    <input id="more_posts_nonce" value="reviewed-nonce" />`;
}

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("official Weinberg event pagination", () => {
  it("parses publisher titles, detail links, and Frederick wall-clock times", () => {
    const parsed = parseWeinbergEventPage(
      page(
        2,
        card(
          "The Hot Sardines",
          "Friday October 9, 2026",
          "8:00 PM",
          "the-hot-sardines",
        ) +
          card(
            "Winter performance",
            "Saturday November 7, 2026",
            "1:00 PM",
            "winter-performance",
          ),
      ),
      SOURCE,
    );

    expect(parsed).toMatchObject({ cardCount: 2, foundCards: 2, invalidCards: 0 });
    expect(parsed.events).toEqual([
      {
        title: "The Hot Sardines",
        starts_at: "2026-10-09T20:00-04:00",
        ticket_url: "https://weinbergcenter.org/shows/the-hot-sardines/",
      },
      {
        title: "Winter performance",
        starts_at: "2026-11-07T13:00-05:00",
        ticket_url: "https://weinbergcenter.org/shows/winter-performance/",
      },
    ]);
  });

  it("reads every official page and sends the reviewed venue filter", async () => {
    const bodies: URLSearchParams[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return response(landing());
      bodies.push(init.body as URLSearchParams);
      const offset = (init.body as URLSearchParams).get("postOffset");
      return response(
        JSON.stringify({
          success: true,
          data:
            offset === "0"
              ? page(
                  3,
                  card("First", "Thursday September 10, 2026", "7:30 PM", "first") +
                    card("Second", "Saturday September 19, 2026", "7:30 PM", "second"),
                )
              : page(
                  3,
                  card("Third", "Saturday October 3, 2026", "12:00 PM", "third"),
                ),
        }),
      );
    }) as typeof fetch;

    const result = await fetchWeinbergEventsResult(SOURCE, {
      venueFilter: "weinberg-center",
      fetchImpl,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error(result.reason);
    expect(result.foundCards).toBe(3);
    expect(result.events.map((event) => event.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(bodies.map((body) => body.get("postOffset"))).toEqual(["0", "2"]);
    expect(bodies.every((body) =>
      body.get("taxQuery") === '{"event_venues":["weinberg-center"]}'),
    ).toBe(true);
  });

  it("fails closed when pagination ends before the publisher's declared count", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return response(landing());
      const offset = (init.body as URLSearchParams).get("postOffset");
      return response(
        JSON.stringify({
          success: true,
          data:
            offset === "0"
              ? page(
                  3,
                  card("First", "Thursday September 10, 2026", "7:30 PM", "first") +
                    card("Second", "Saturday September 19, 2026", "7:30 PM", "second"),
                )
              : page(3, ""),
        }),
      );
    }) as typeof fetch;

    const result = await fetchWeinbergEventsResult(SOURCE, {
      venueFilter: "weinberg-center",
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "failure",
      events: [],
      reason: "pagination ended before every event card was read",
    });
  });

  it("fails closed when an official card loses its date-time or detail link", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return response(landing(1));
      return response(
        JSON.stringify({
          success: true,
          data: page(
            1,
            '<article class="js-post"><h4 class="show-title">Incomplete</h4></article>',
          ),
        }),
      );
    }) as typeof fetch;

    const result = await fetchWeinbergEventsResult(SOURCE, {
      venueFilter: "new-spire-arts",
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "failure",
      events: [],
      reason: "official event cards could not be parsed completely",
    });
  });
});
