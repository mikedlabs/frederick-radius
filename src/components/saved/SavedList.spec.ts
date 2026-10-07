import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_RECENT_LIMIT,
  EmptyState,
  recentPlaceFact,
  SavedEventRefreshNotice,
  fetchSavedEventsBySlugs,
  fetchSavedEventsHydration,
  mergeSavedEventHydration,
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
      "Save a place, event, bus trip, or stop to keep it here for later.",
    );
    expect(html).toContain('data-saved-empty-state="true"');
    expect(html).toContain("font-sans");
    expect(html).toContain("Find something to save");
    expect(html).toContain('href="/search"');
    expect(html).toContain("Find a bus or stop");
    expect(html).toContain('href="/transit"');
    expect(html).not.toContain('href="/map"');
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('href="/ask"');
    expect(html).not.toContain("min-h-[34rem]");
  });

  it("states its purpose once, in one 16px sentence", () => {
    const html = renderToStaticMarkup(createElement(EmptyState));
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");

    // One sentence at body size, not an 18px headline stacked under a caps
    // standfirst that said the same thing.
    expect(html).toContain("text-[16px]");
    expect(html).not.toContain("text-[18px]");
    expect(html.match(/<p\b/g)).toHaveLength(1);
    expect(source).not.toContain("Places, events, buses, and stops you want to keep");
    // The empty branch renders the masthead without a standfirst.
    const emptyBranch = source.slice(
      source.indexOf("savedTransitBuses.length === 0\n  ) {"),
      source.indexOf("// Cluster signal"),
    );
    expect(emptyBranch).toContain("<Masthead />");
    expect(emptyBranch).not.toContain("stand=");
  });

  it("makes Find something to save the single filled Brick button and keeps transit a Creek text link", () => {
    const html = renderToStaticMarkup(createElement(EmptyState));
    const search = html.slice(html.lastIndexOf("<a", html.indexOf('href="/search"')), html.indexOf("</a>", html.indexOf('href="/search"')));
    const transit = html.slice(html.lastIndexOf("<a", html.indexOf('href="/transit"')), html.indexOf("</a>", html.indexOf('href="/transit"')));

    // Button size="lg": 48px tall, radius-md, Brick fill with on-brand text.
    expect(search).toContain("h-12");
    expect(search).toContain("rounded-[var(--app-radius-md)]");
    expect(search).toContain("background-color:var(--app-brand-press)");
    expect(search).toContain("color:var(--app-on-brand)");
    expect(search).not.toContain("rounded-full");
    expect(search).not.toContain("background:var(--app-ink)");

    // Transit stays a quiet Creek link with a 44px effective target.
    expect(transit).toContain("color:var(--app-cool)");
    expect(transit).toContain("tap-44");
    expect(transit).toContain("underline");
    expect(transit).not.toContain("background");
    expect(transit).not.toContain("border");

    // Exactly one filled action on the page.
    expect(html.match(/var\(--app-brand-press\)/g)).toHaveLength(1);
    expect(html).not.toContain("var(--app-ink);color:var(--app-bg)");
  });

  it("offers up to three places the person just looked at, each one tap from saved", () => {
    const recent = [
      { slug: "beans-in-belfry", name: "Beans in the Belfry", category: "coffee", municipality: "brunswick", city: "Brunswick", address: "122 W Potomac St", google_photo_url: "/api/place-photo?name=places%2FChIJbelfry%2Fphotos%2Fa&w=800", open_status: { state: "open", closesAt: "21:00", closingSoon: false } },
      { slug: "griffins-tavern", name: "Griffin's Tavern", category: "restaurant", municipality: "frederick", city: "Frederick", address: "", open_status: { state: "unknown" } },
      { slug: "third", name: "Third Place", category: "coffee", municipality: "frederick", city: "Frederick", address: "", open_status: { state: "unknown" } },
      { slug: "fourth", name: "Fourth Place", category: "coffee", municipality: "frederick", city: "Frederick", address: "", open_status: { state: "unknown" } },
    ] as PlaceCardData[];

    const html = renderToStaticMarkup(
      createElement(EmptyState, { recentPlaces: recent, onClearRecent: () => {} }),
    );

    expect(EMPTY_RECENT_LIMIT).toBe(3);
    expect(html).toContain("You looked at these recently");
    expect(html.match(/data-saved-empty-recent-row=/g)).toHaveLength(3);
    expect(html).not.toContain("Fourth Place");
    // Visual first: a real photo when the loader approved one, else the mark.
    expect(html).toContain('data-place-media="photo"');
    expect(html).toContain('data-place-media="fallback"');
    expect(html.indexOf('data-place-media="photo"')).toBeLessThan(html.indexOf("Beans in the Belfry"));
    // Name, one fact line, and the shared save toggle for every row.
    expect(html).toContain("Brunswick · Open till 9 PM");
    expect(html.match(/data-save-ref="place:/g)).toHaveLength(3);
    expect(html).toContain('data-save-ref="place:beans-in-belfry"');
    expect(html).toContain("/places/beans-in-belfry");
    expect(html).toContain("Clear");
    // The places come before the way to go find something else.
    expect(html.indexOf("You looked at these recently")).toBeLessThan(html.indexOf('href="/search"'));
  });

  it("omits the recent section when nothing has been viewed", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { recentPlaces: [] }));

    expect(html).not.toContain("You looked at these recently");
    expect(html).not.toContain("data-save-ref");
  });

  it("feeds recently viewed places into the empty branch and softens its rule", () => {
    const source = readFileSync("src/components/saved/SavedList.tsx", "utf8");
    const css = readFileSync("src/components/saved/SavedList.module.css", "utf8");

    expect(source).toContain("<EmptyState recentPlaces={recentPlaces} onClearRecent={clearRecent} />");
    // The Home Screen row keeps a 1px border hairline, not the colophon's
    // heavy Ink rule, on the empty page only.
    expect(source).toContain("styles.emptyKeep");
    expect(css).toMatch(/\.emptyKeep :global\(\.sv-colophon\) \{\s*border-top: 0;\s*padding-top: 0;/);
    expect(css).toContain("border-top: 1px solid var(--app-border)");
    expect(css).not.toContain("var(--app-ink)");
  });

  it("writes the recent fact line from the town and a known clock state only", () => {
    const open = { municipality: "brunswick", city: "Brunswick", open_status: { state: "open", closesAt: "21:00", closingSoon: false } } as PlaceCardData;
    const closed = { municipality: "frederick", city: "Frederick", open_status: { state: "closed", opensAt: "17:00", opensToday: true } } as PlaceCardData;
    const unverified = { municipality: "frederick", city: "Frederick", open_status: { state: "unverified" } } as PlaceCardData;
    const unknownTown = { municipality: "", city: "Adamstown", open_status: { state: "unknown" } } as PlaceCardData;

    expect(recentPlaceFact(open)).toBe("Brunswick · Open till 9 PM");
    // Town names follow the wallet (owner call: "Frederick City", not the
    // ambiguous bare "Frederick" in a county guide).
    expect(recentPlaceFact(closed)).toBe("Frederick City · Opens 5 PM");
    expect(recentPlaceFact(unverified)).toBe("Frederick City");
    expect(recentPlaceFact(unknownTown)).toBe("Adamstown");
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
      expect(source).toContain("className=\"sw-brand\"");
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

  it("does not advertise the dormant saved-event reminder worker", () => {
    const button = readFileSync("src/components/saved/SaveButton.tsx", "utf8");
    const list = readFileSync("src/components/saved/SavedList.tsx", "utf8");
    const notifications = readFileSync(
      "src/components/settings/NotificationsCard.tsx",
      "utf8",
    );

    expect(button).not.toContain("syncSavedEventReminder");
    expect(button).not.toContain("maybeOfferEventReminders");
    expect(button).not.toContain("nudge an hour");
    expect(list).not.toContain("A nudge before a saved place closes");
    expect(notifications).not.toContain('topics: ["saved-events"');
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
  });
});
