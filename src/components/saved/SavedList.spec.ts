import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmptyState,
  SavedEventRefreshNotice,
  savedEventDatesLabel,
  savedStandfirstParts,
  fetchSavedEventsBySlugs,
  fetchSavedEventsHydration,
  mergeSavedEventHydration,
  savedEventRowIds,
  mergeSavedPlaceHydration,
  SavedPlaceRefreshNotice,
  fetchSavedPlacesBySlugs,
} from "./SavedList";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { PlaceCardData } from "@/lib/loaders/places";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SavedList empty state", () => {
  it("resolves a collection beyond the API's per-request cap instead of declaring later saves missing", async () => {
    const slugs = Array.from({ length: 101 }, (_, index) => `place-${index}`);
    const fetchMock = vi.fn(async (url: string) => {
      const batch = new URL(url, "https://example.test").searchParams.get("slugs")!.split(",");
      expect(batch.length).toBeLessThanOrEqual(100);
      return new Response(JSON.stringify({ places: batch.map((slug) => ({ slug })) }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const places = await fetchSavedPlacesBySlugs(slugs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(places.map((place) => place.slug)).toEqual(slugs);
  });

  it("preserves loaded places after a failed refresh without repeating an obsolete open-now claim", () => {
    const place = { slug: "beans-in-belfry", name: "Beans in the Belfry", open_status: { state: "open", closesAt: "17:00", closingSoon: false } } as PlaceCardData;
    const original = new Map([[place.slug, place]]);
    const failed = mergeSavedPlaceHydration(original, [place.slug], null);
    expect(failed.get(place.slug)?.name).toBe(place.name);
    expect(failed.get(place.slug)?.open_status.state).toBe("unknown");
    expect(original.get(place.slug)?.open_status.state).toBe("open");
    expect(mergeSavedPlaceHydration(failed, [place.slug], [place]).get(place.slug)?.open_status.state).toBe("open");
    expect(mergeSavedPlaceHydration(failed, [place.slug], []).has(place.slug)).toBe(false);
  });

  it("distinguishes a refresh failure from a missing place and gives a local retry", () => {
    const html = renderToStaticMarkup(createElement(SavedPlaceRefreshNotice, { unavailableCount: 2, missingCount: 0, retrying: false, onRetry: () => {} }));
    expect(html).toContain("We could not refresh 2 saved places");
    expect(html).toContain("Your saves are still here.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("no longer listed");
  });

  it("offers clear discovery and transit next steps without repeating the app shell", () => {
    const html = renderToStaticMarkup(createElement(EmptyState));

    expect(html).toContain(
      "Use Save on a place, event or outing to return to it here.",
    );
    expect(html).toContain('data-saved-empty-state="true"');
    expect(html).toContain("font-sans");
    expect(html).toContain("Find a place or event");
    expect(html).toContain('href="/search"');
    expect(html).toContain("Find a bus or stop");
    expect(html).toContain('href="/transit"');
    expect(html).not.toContain('href="/map"');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/ask"');
    expect(html).not.toContain("min-h-[34rem]");
  });

  it("leads with useful saved content and keeps transit quiet before one organizer reveal", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");
    const useful = source.indexOf('id="saved-useful-now"');
    const saved = source.indexOf('id="saved-places-heading"');
    const upcoming = source.indexOf('aria-label="Upcoming saved events"');
    const transit = source.indexOf("<SavedTransitSection");
    const organizer = source.indexOf('id="saved-organizer"');

    expect(useful).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(useful);
    expect(upcoming).toBeGreaterThan(saved);
    expect(transit).toBeGreaterThan(upcoming);
    expect(organizer).toBeGreaterThan(transit);
    expect(source).toContain("collapsed={hasOrganizerContent}");
    expect(source.match(/<details/g)).toHaveLength(1);
    expect(source).toContain("Lists, map, notes, visits, and sharing");
  });

  it("renders saved transit as an accessible quiet disclosure when collapsed", () => {
    const source = readFileSync(
      "src/components/saved/SavedTransitSection.tsx",
      "utf8",
    );

    expect(source).toContain("collapsed = false");
    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain('id="saved-transit-heading"');
    expect(source).toContain('href="/transit"');
    expect(source).toContain("Open for live status.");
  });

  it("keeps wallet navigation and disclosure as separate native controls", () => {
    for (const file of ["SavedWallet.tsx", "SavedEventWallet.tsx"]) {
      const source = readFileSync(`src/components/saved/${file}`, "utf8");

      expect(source).not.toContain('role="button"');
      expect(source).toContain("aria-expanded={open}");
      expect(source).toContain("aria-controls=");
      expect(source).toMatch(/className="sw-brand(?: [^"]*)?"/);
      expect(source).toContain("<Link");
      expect(source).toContain("onToggle");
    }
  });

  it("does not render an empty account before saved state has hydrated", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");

    expect(source).toContain(
      "const hasAccountBootstrap = Boolean(userId) && initialFollowSlugs !== undefined",
    );
    expect(source).toContain("(!mounted && !hasAccountBootstrap)");
    expect(source).toContain("if (savedStatePending || placesPending)");
  });

  it("does not advertise saved-event reminders, which the app does not send", () => {
    const button = readFileSync("src/components/saved/SaveButton.tsx", "utf8");
    const list = readFileSync("src/components/saved/SavedList.tsx", "utf8");

    expect(button).not.toContain("syncSavedEventReminder");
    expect(button).not.toContain("maybeOfferEventReminders");
    expect(button).not.toContain("nudge an hour");
    expect(list).not.toContain("A nudge before a saved place closes");
  });

  it("hydrates a signed-in saved page from the server snapshot before client effects", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");

    expect(source).toContain("initialFollowSlugs?: string[]");
    expect(source).toContain("initialPlaces?: PlaceCardData[]");
    expect(source).toContain(
      "new Map(initialPlaces.map((place) => [place.slug, place]))",
    );
    expect(source).toContain(
      'initialFollowSlugs ? initialFollowSlugs.join(",") : null',
    );
  });

  it("hydrates event batches with a bounded JSON POST instead of a query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tooMany = Array.from({ length: 140 }, (_, i) => `event-${i}`);
    await fetchSavedEventsBySlugs(tooMany);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/events/by-slugs");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body)).slugs).toHaveLength(100);
    expect(url).not.toContain("?slugs=");
  });

  it("treats omitted rows from an older API response as unresolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ events: [{ slug: "resolved-event" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await fetchSavedEventsHydration([
      "resolved-event",
      "not-returned",
    ]);

    expect(result.events.map((event) => event.slug)).toEqual(["resolved-event"]);
    expect(result.unresolvedSlugs).toEqual(["not-returned"]);
    expect(result.missingSlugs).toEqual([]);
    expect(result.degraded).toBe(true);
  });

  it("preserves the API distinction between unresolved and absent saves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [],
            resolvedSlugs: [],
            unresolvedSlugs: ["feed-timeout"],
            missingSlugs: ["removed-event"],
            degraded: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await fetchSavedEventsHydration([
      "feed-timeout",
      "removed-event",
    ]);

    expect(result.unresolvedSlugs).toEqual(["feed-timeout"]);
    expect(result.missingSlugs).toEqual(["removed-event"]);
    expect(result.degraded).toBe(true);
  });

  it("removes a stale card only after a later refresh confirms it is missing", () => {
    const event = { slug: "removed-event" } as EventWithMeta;
    const first = mergeSavedEventHydration(new Map(), {
      events: [event],
      resolvedSlugs: [
        { requestedSlug: event.slug, canonicalSlug: event.slug },
      ],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });

    expect(first.get("removed-event")).toBe(event);

    const second = mergeSavedEventHydration(first, {
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [],
      missingSlugs: ["removed-event"],
      degraded: false,
    });

    expect(second.has("removed-event")).toBe(false);
  });

  it("preserves a last-known card while its refresh is unresolved", () => {
    const event = { slug: "feed-timeout" } as EventWithMeta;
    const previous = new Map([[event.slug, event]]);

    const next = mergeSavedEventHydration(previous, {
      events: [],
      resolvedSlugs: [],
      unresolvedSlugs: [event.slug],
      missingSlugs: [],
      degraded: true,
    });

    expect(next.get(event.slug)).toBe(event);
  });

  it("hydrates a historical saved alias with its canonical event card", () => {
    const canonical = { slug: "current-event-title" } as EventWithMeta;

    const next = mergeSavedEventHydration(new Map(), {
      events: [canonical],
      resolvedSlugs: [
        {
          requestedSlug: "old-event-title",
          canonicalSlug: canonical.slug,
        },
      ],
      unresolvedSlugs: [],
      missingSlugs: [],
      degraded: false,
    });

    expect(next.get("old-event-title")).toBe(canonical);
    expect(next.get("current-event-title")).toBe(canonical);
  });

  it("keeps the saved row id of an event saved under an older slug", () => {
    const canonical = { slug: "current-event-title" } as EventWithMeta;
    const other = { slug: "other-event" } as EventWithMeta;
    const eventsBySlug = new Map([
      ["old-event-title", canonical],
      ["current-event-title", canonical],
      ["other-event", other],
    ]);

    expect(savedEventRowIds([
      { type: "event", id: "old-event-title" },
      { type: "place", id: "other-event" },
      { type: "event", id: "other-event" },
      { type: "event", id: "unresolved-event" },
    ], eventsBySlug)).toEqual({
      "current-event-title": "old-event-title",
      "other-event": "other-event",
    });
  });

  it("tells the reader ambiguous event misses are still saved", () => {
    const html = renderToStaticMarkup(
      createElement(SavedEventRefreshNotice, {
        unresolvedCount: 2,
        missingCount: 1,
      }),
    );

    expect(html).toContain("could not refresh 2 saved events right now");
    expect(html).toContain("They are still saved");
    expect(html).toContain("1 saved event is no longer listed");
    expect(html).toContain("It remains saved on this device");
    // A notice with nothing wired to it offers no control it cannot honor.
    expect(html).not.toContain("<button");
  });

  it("gives each kind of saved-event miss its own way to act", () => {
    const html = renderToStaticMarkup(
      createElement(SavedEventRefreshNotice, {
        unresolvedCount: 2,
        missingCount: 1,
        missingSavedAt: ["2026-11-18T15:00:00Z"],
        onRetry: () => {},
        onRemoveMissing: () => {},
      }),
    );

    expect(html).toContain("Try again");
    expect(html).toContain("Remove from Saved");
    // Each accessible name starts with the visible label it extends.
    expect(html).toContain('aria-label="Remove from Saved: the event that is no longer listed"');
    expect(html).toContain('aria-label="Try again: saved events"');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/tap-44/g)).toHaveLength(2);
    expect(html.match(/color:var\(--app-link\)/g)).toHaveLength(2);

    const missingOnly = renderToStaticMarkup(
      createElement(SavedEventRefreshNotice, { unresolvedCount: 0, missingCount: 1, onRetry: () => {}, onRemoveMissing: () => {} }),
    );
    expect(missingOnly).not.toContain("Try again");
    expect(missingOnly).toContain("Remove from Saved");
    const unresolvedOnly = renderToStaticMarkup(
      createElement(SavedEventRefreshNotice, { unresolvedCount: 1, missingCount: 0, onRetry: () => {}, onRemoveMissing: () => {} }),
    );
    expect(unresolvedOnly).toContain("Try again");
    expect(unresolvedOnly).not.toContain("Remove from Saved");
  });

  it("says only what the saved row knows about an event that is no longer listed", () => {
    const render = (missingSavedAt: string[]) => renderToStaticMarkup(
      createElement(SavedEventRefreshNotice, { unresolvedCount: 0, missingCount: missingSavedAt.length, missingSavedAt }),
    );

    expect(render(["2026-11-18T15:00:00Z"])).toContain(
      "It remains saved on this device, which kept when you saved it (Nov 18) but not its name.",
    );
    expect(render(["2026-11-20T15:00:00Z", "2026-11-12T15:00:00Z", "2026-11-18T15:00:00Z"])).toContain(
      "They remain saved on this device, which kept when you saved them (Nov 12 to Nov 20) but not their names.",
    );
    // A row with no usable stamp claims no date.
    expect(render(["not-a-date"])).toContain("It remains saved on this device, which kept no name for it.");
    expect(render(["not-a-date"])).not.toContain("when you saved");
  });

  it("reads saved dates in Frederick time and collapses a single day", () => {
    expect(savedEventDatesLabel([])).toBeNull();
    expect(savedEventDatesLabel(["1970-01-01T00:00:00.000Z"])).toBeNull();
    expect(savedEventDatesLabel(["2026-11-18T15:00:00Z", "2026-11-18T22:00:00Z"])).toBe("Nov 18");
    // 03:30 UTC on the 19th is still the evening of the 18th in Frederick.
    expect(savedEventDatesLabel(["2026-11-19T03:30:00Z"])).toBe("Nov 18");
    expect(savedEventDatesLabel(["2026-11-20T15:00:00Z", "bad", "2026-11-12T15:00:00Z"])).toBe("Nov 12 to Nov 20");
  });

  it("counts saved events in the standfirst beside places and towns", () => {
    const texts = (counts: Parameters<typeof savedStandfirstParts>[0]) =>
      savedStandfirstParts(counts).map((part) => part.text);
    const none = { places: 0, towns: 0, events: 0, outings: 0, transit: 0 };

    // The reported case: three places in two towns and two saved events.
    expect(texts({ ...none, places: 3, towns: 2, events: 2 })).toEqual(["3 places", "2 towns", "2 events"]);
    expect(texts({ ...none, places: 1, towns: 1, events: 1 })).toEqual(["1 place", "1 event"]);
    expect(texts({ ...none, places: 2, towns: 2, events: 1, outings: 1, transit: 3 })).toEqual([
      "2 places", "2 towns", "1 event", "1 outing on this device", "3 transit saves",
    ]);
    expect(texts(none)).toEqual([]);
    // The first of places or events leads. Events lead only with no places.
    expect(savedStandfirstParts({ ...none, events: 2 })).toEqual([{ key: "events", text: "2 events", lead: true }]);
    expect(savedStandfirstParts({ ...none, places: 3, towns: 2, events: 2 }).map((part) => part.lead)).toEqual([true, false, false]);
  });

});
