import { describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { stampEventProvenance } from "@/lib/provenance";
import {
  EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS,
  MAX_EVENTS_BY_SLUG,
  normalizeRequestedEventSlugList,
  normalizeRequestedEventSlugs,
  resolveEventsBySlugs,
  resolveEventsBySlugsWithStatus,
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
    publicEvents: async () => [],
    archive: async () => ({ matches: [], unresolvedSlugs: [] }),
    ...overrides,
  };
}

function archivedMatch(
  requestedSlug: string,
  canonicalSlug = requestedSlug,
) {
  return {
    id: `identity-${requestedSlug}`,
    requestedSlug,
    canonicalSlug,
    event: row(canonicalSlug),
    tombstoned: false,
    lastSeenAt: "2026-08-04T12:00:00.000Z",
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
      sources({ publicEvents: async () => [row(ingested)] }),
    );

    expect(events.map((e) => e.slug)).toEqual([ingested]);
  });

  it("asks the public snapshot once for the whole batch", async () => {
    const publicEvents = vi.fn(async () => [row("a-event"), row("b-event")]);
    const events = await resolveEventsBySlugs(
      ["a-event", "b-event", "c-event"],
      NOW,
      sources({ publicEvents }),
    );

    expect(publicEvents).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.slug)).toEqual(["a-event", "b-event"]);
  });

  it("returns rows in the order requested, not the order resolved", async () => {
    const events = await resolveEventsBySlugs(
      ["c-event", "a-event", "b-event"],
      NOW,
      sources({
        seed: (slug) => (slug === "b-event" ? row(slug) : null),
        publicEvents: async () => [row("a-event"), row("c-event")],
      }),
    );

    expect(events.map((e) => e.slug)).toEqual([
      "c-event",
      "a-event",
      "b-event",
    ]);
  });

  it("only reaches the archive for slugs the snapshot did not answer", async () => {
    const archive = vi.fn(async (slugs: readonly string[]) => ({
      matches: slugs.map((slug) => archivedMatch(slug)),
      unresolvedSlugs: [],
    }));
    const events = await resolveEventsBySlugs(
      ["live-now", "long-past"],
      NOW,
      sources({ publicEvents: async () => [row("live-now")], archive }),
    );

    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive.mock.calls[0][0]).toEqual(["long-past"]);
    expect(events.map((e) => e.slug)).toEqual(["live-now", "long-past"]);
  });

  it("preserves an archived alias binding to its canonical event route", async () => {
    const result = await resolveEventsBySlugsWithStatus(
      ["old-event-title"],
      NOW,
      sources({
        archive: async () => ({
          matches: [archivedMatch("old-event-title", "current-event-title")],
          unresolvedSlugs: [],
        }),
      }),
    );

    expect(result.events.map((event) => event.slug)).toEqual([
      "current-event-title",
    ]);
    expect(result.resolvedSlugs).toEqual([
      {
        requestedSlug: "old-event-title",
        canonicalSlug: "current-event-title",
      },
    ]);
  });

  it("confirms non-public archive rows missing without disclosing their snapshots", async () => {
    const privateEvent = {
      ...row("private-event"),
      title: "Private Corporate Event",
      address: "Confidential suite, Frederick, MD",
    };
    const civicEvent = {
      ...row("civic-event"),
      title: "Planning Commission Hearing",
      category: "civic",
    };
    const cancelledEvent = {
      ...row("cancelled-event"),
      title: "Cancelled Concert",
      status: "cancelled" as const,
    };
    const endedEvent = {
      ...row("ended-event"),
      title: "Already Ended Event",
      starts_at: "2026-08-03T22:00:00.000Z",
      ends_at: "2026-08-04T01:00:00.000Z",
    };
    const requested = [
      privateEvent.slug,
      civicEvent.slug,
      cancelledEvent.slug,
      endedEvent.slug,
      "tombstoned-event",
    ];
    const result = await resolveEventsBySlugsWithStatus(
      requested,
      NOW,
      sources({
        // Even during a genuinely degraded public read, a healthy archive can
        // prove that these specific records are not publicly renderable.
        publicEvents: async () => ({ events: [], degraded: true }),
        archive: async () => ({
          matches: [
            { ...archivedMatch(privateEvent.slug), event: privateEvent },
            { ...archivedMatch(civicEvent.slug), event: civicEvent },
            { ...archivedMatch(cancelledEvent.slug), event: cancelledEvent },
            { ...archivedMatch(endedEvent.slug), event: endedEvent },
            {
              ...archivedMatch("tombstoned-event"),
              event: {
                ...row("tombstoned-event"),
                title: "Deleted confidential event",
                address: "Private address",
              },
              tombstoned: true,
            },
          ],
          unresolvedSlugs: [],
        }),
      }),
    );

    expect(result.events).toEqual([]);
    expect(result.resolvedSlugs).toEqual([]);
    expect(result.missingSlugs).toEqual(requested);
    expect(result.unresolvedSlugs).toEqual([]);
    expect(result.degraded).toBe(true);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Confidential suite");
    expect(payload).not.toContain("Planning Commission Hearing");
    expect(payload).not.toContain("Cancelled Concert");
    expect(payload).not.toContain("Already Ended Event");
    expect(payload).not.toContain("Deleted confidential event");
  });

  it("keeps the resolved rows when a source fails", async () => {
    const events = await resolveEventsBySlugs(
      ["seeded", "from-feed"],
      NOW,
      sources({
        seed: (slug) => (slug === "seeded" ? row(slug) : null),
        publicEvents: async () => {
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

  it("keeps partial feed misses unresolved instead of calling them absent", async () => {
    const result = await resolveEventsBySlugsWithStatus(
      ["available", "from-degraded-feed"],
      NOW,
      sources({
        publicEvents: async () => ({
          events: [row("available")],
          degraded: true,
        }),
      }),
    );

    expect(result.events.map((event) => event.slug)).toEqual(["available"]);
    expect(result.unresolvedSlugs).toEqual(["from-degraded-feed"]);
    expect(result.missingSlugs).toEqual([]);
    expect(result.degraded).toBe(true);
  });

  it("only calls a slug missing after healthy public and archive reads", async () => {
    const result = await resolveEventsBySlugsWithStatus(
      ["deleted-event"],
      NOW,
      sources(),
    );

    expect(result.events).toEqual([]);
    expect(result.unresolvedSlugs).toEqual([]);
    expect(result.missingSlugs).toEqual(["deleted-event"]);
    expect(result.degraded).toBe(false);
  });

  it("marks an archive failure unresolved even when the public read succeeds", async () => {
    const result = await resolveEventsBySlugsWithStatus(
      ["past-event"],
      NOW,
      sources({
        archive: async () => {
          throw new Error("archive unavailable");
        },
      }),
    );

    expect(result.unresolvedSlugs).toEqual(["past-event"]);
    expect(result.missingSlugs).toEqual([]);
    expect(result.degraded).toBe(true);
  });

  it("uses one bounded archive operation for the maximum saved batch", async () => {
    const archive = vi.fn<EventsBySlugsSources["archive"]>(async () => ({
      matches: [],
      unresolvedSlugs: [],
    }));
    const requested = Array.from(
      { length: MAX_EVENTS_BY_SLUG },
      (_, index) => `past-event-${index}`,
    );

    await resolveEventsBySlugs(requested, NOW, sources({ archive }));

    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive.mock.calls[0][0]).toEqual(requested);
    expect(archive.mock.calls[0][1]).toBe(
      EVENTS_BY_SLUG_ARCHIVE_BUDGET_MS,
    );
  });

  it("preserves per-slug unresolved status from one healthy batch response", async () => {
    const result = await resolveEventsBySlugsWithStatus(
      ["invalid-snapshot", "known-missing"],
      NOW,
      sources({
        archive: async () => ({
          matches: [],
          unresolvedSlugs: ["invalid-snapshot"],
        }),
      }),
    );

    expect(result.unresolvedSlugs).toEqual(["invalid-snapshot"]);
    expect(result.missingSlugs).toEqual(["known-missing"]);
    expect(result.degraded).toBe(true);
  });

  it("answers an empty request without touching any source", async () => {
    const publicEvents = vi.fn(async () => []);
    expect(await resolveEventsBySlugs([], NOW, sources({ publicEvents }))).toEqual([]);
    expect(publicEvents).not.toHaveBeenCalled();
  });
});
