import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { stampEventProvenance } from "@/lib/provenance";
import {
  EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS,
  MAX_EVENTS_BY_SLUG,
  normalizeRequestedEventSlugList,
  normalizeRequestedEventSlugs,
  resolveEventsBySlugs,
  type EventsBySlugsSources,
} from "./eventsBySlugs";

/** A resolved row, stamped through the real provenance helper so the fixture
 *  cannot drift from the shape the surfaces actually receive. */
function row(slug: string): EventWithMeta {
  const base = {
    slug,
    title: slug,
    description: "",
    starts_at: "2026-08-10T22:00:00.000Z",
    ends_at: "2026-08-11T01:00:00.000Z",
    timezone: "America/New_York" as const,
    venue_name: "Sky Stage",
    address: "59 S Carroll St, Frederick, MD 21701",
    geom: { lng: -77.4118, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: ["adults"],
    is_free: true,
    source: "manual" as const,
    is_verified: true,
  };
  return {
    ...base,
    ...stampEventProvenance(base),
    geo_confidence: "venue_match",
    category_name: "Music",
    municipality_name: "Frederick",
  };
}

function sources(
  overrides: Partial<EventsBySlugsSources> = {},
): EventsBySlugsSources {
  return {
    seed: () => null,
    unified: async () => [],
    archive: async () => null,
    now: () => 0,
    ...overrides,
  };
}

const NOW = new Date("2026-08-04T12:00:00.000Z");

describe("normalizeRequestedEventSlugs", () => {
  it("trims, deduplicates, and preserves the requested order", () => {
    expect(
      normalizeRequestedEventSlugs(" b-event , a-event,b-event "),
    ).toEqual(["b-event", "a-event"]);
  });

  it("drops values that cannot be event slugs before any lookup runs", () => {
    expect(
      normalizeRequestedEventSlugs(
        "constructor,prototype,Upper-Case,has space,-leading,ok-slug",
      ),
    ).toEqual(["ok-slug"]);
  });

  it("caps a pathological request", () => {
    const raw = Array.from(
      { length: MAX_EVENTS_BY_SLUG + 40 },
      (_, i) => `event-${i}`,
    ).join(",");
    expect(normalizeRequestedEventSlugs(raw)).toHaveLength(MAX_EVENTS_BY_SLUG);
  });
});

describe("normalizeRequestedEventSlugList", () => {
  it("shares the GET validator for JSON arrays", () => {
    expect(
      normalizeRequestedEventSlugList([
        " b-event ",
        12,
        "a-event",
        "b-event",
        "Not A Slug",
      ]),
    ).toEqual(["b-event", "a-event"]);
  });

  it("caps a JSON batch before source work", () => {
    const raw = Array.from(
      { length: MAX_EVENTS_BY_SLUG + 40 },
      (_, i) => `event-${i}`,
    );
    expect(normalizeRequestedEventSlugList(raw)).toHaveLength(
      MAX_EVENTS_BY_SLUG,
    );
  });
});

describe("resolveEventsBySlugs", () => {
  it("resolves an ingested slug the curated seed set cannot contain", async () => {
    // The shipped bug in one assertion: this slug is namespaced so it can
    // never appear in EVENT_BY_SLUG, and the saved card used to vanish.
    const ingested = "ing-dfp-summer-concert-20260810";
    const events = await resolveEventsBySlugs(
      [ingested],
      NOW,
      sources({ unified: async () => [row(ingested)] }),
    );

    expect(events.map((e) => e.slug)).toEqual([ingested]);
  });

  it("asks the unified snapshot once for the whole batch", async () => {
    const unified = vi.fn(async () => [row("a-event"), row("b-event")]);
    const events = await resolveEventsBySlugs(
      ["a-event", "b-event", "c-event"],
      NOW,
      sources({ unified }),
    );

    expect(unified).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.slug)).toEqual(["a-event", "b-event"]);
  });

  it("returns rows in the order requested, not the order resolved", async () => {
    const events = await resolveEventsBySlugs(
      ["c-event", "a-event", "b-event"],
      NOW,
      sources({
        seed: (slug) => (slug === "b-event" ? row(slug) : null),
        unified: async () => [row("a-event"), row("c-event")],
      }),
    );

    expect(events.map((e) => e.slug)).toEqual([
      "c-event",
      "a-event",
      "b-event",
    ]);
  });

  it("only reaches the archive for slugs the snapshot did not answer", async () => {
    const archive = vi.fn(async (slug: string) => ({ event: row(slug) }));
    const events = await resolveEventsBySlugs(
      ["live-now", "long-past"],
      NOW,
      sources({ unified: async () => [row("live-now")], archive }),
    );

    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive.mock.calls[0][0]).toBe("long-past");
    expect(events.map((e) => e.slug)).toEqual(["live-now", "long-past"]);
  });

  it("keeps the resolved rows when a source fails", async () => {
    const events = await resolveEventsBySlugs(
      ["seeded", "from-feed"],
      NOW,
      sources({
        seed: (slug) => (slug === "seeded" ? row(slug) : null),
        unified: async () => {
          throw new Error("every provider timed out");
        },
        archive: async () => {
          throw new Error("archive unreachable");
        },
      }),
    );

    // A degraded batch is a shorter list, never a rejected request: Saved
    // renders what it has and retries the rest on the next load.
    expect(events.map((e) => e.slug)).toEqual(["seeded"]);
  });

  it("stops spending archive reads once the batch budget is gone", async () => {
    let clock = 0;
    const archive = vi.fn(async (slug: string) => {
      clock += EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS;
      return { event: row(slug) };
    });

    const events = await resolveEventsBySlugs(
      ["past-1", "past-2", "past-3"],
      NOW,
      sources({ archive, now: () => clock }),
    );

    // Six workers start together, so the first wave still runs; what the
    // budget guarantees is that the tail cannot keep opening reads forever.
    expect(events.length).toBeLessThan(3);
    expect(archive.mock.calls.length).toBeLessThan(3);
  });

  it("gives the archive a bounded slice of the shared budget", async () => {
    const archive = vi.fn<EventsBySlugsSources["archive"]>(async () => null);
    await resolveEventsBySlugs(["past-1"], NOW, sources({ archive }));

    const timeoutMs = archive.mock.calls[0][1];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS);
  });

  it("answers an empty request without touching any source", async () => {
    const unified = vi.fn(async () => []);
    expect(await resolveEventsBySlugs([], NOW, sources({ unified }))).toEqual([]);
    expect(unified).not.toHaveBeenCalled();
  });
});
