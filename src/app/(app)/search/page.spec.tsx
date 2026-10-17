import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchHit } from "@/lib/search";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  eventSnapshot: vi.fn(),
}));

vi.mock("@/lib/search", () => ({ qualifiedSearch: (...args: unknown[]) => ({ hits: mocks.search(...args), meta: { qualifiers: {} } }), isEventSearchIntent: () => false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: (...args: unknown[]) => mocks.eventSnapshot(...args),
  EVENT_BROWSE_SNAPSHOT_TIMEOUT_MS: 2_500,
}));
vi.mock("@/components/search/SearchBrowsePosition", () => ({ default: () => null }));
vi.mock("@/components/search/SearchRefinements", () => ({ default: () => <div data-search-area /> }));
vi.mock("@/lib/search/answer", () => ({ primaryAnswerFor: () => undefined }));
vi.mock("@/data/departments", () => ({
  findDepartments: () => [],
  formatPhone: (phone: string) => phone,
  jurisdictionLabel: () => "",
}));
vi.mock("@/lib/search/civic", () => ({
  isHighConfidenceCivicIntent: () => false,
  searchCivicActions: () => [],
  shouldShowDepartmentAnswers: () => false,
}));
vi.mock("@/components/search/SearchInput", () => ({
  default: () => <div data-search-input />,
}));

import SearchPage from "./page";

function paidPlaceHit(index: number): SearchHit {
  const hit = {
    type: "place" as const,
    score: 100 - index,
    place: {
      slug: `paid-place-${index}`,
      name: `Paid place ${index}`,
      category: "restaurant",
      address: `${index} Market Street`,
      city: "Frederick",
      municipality: "frederick",
      short_blurb: "A deterministic submitted-search fixture.",
      state: "MD" as const,
      postal_code: "21701",
      geom: { lng: -77.41, lat: 39.41 },
      is_verified: false,
      feature_score: 0,
      source: "manual" as const,
      updated_at: "2026-10-16",
      source_id: `component-workshop:paid-place-${index}`,
      source_url: null,
      license: "Demonstration fixture",
      confidence: "curated" as const,
      first_seen_at: "2026-10-16T10:00:00Z",
      last_verified_at: "2026-10-16T10:00:00Z",
      open_status: { state: "unknown" as const },
      google_photo_url:
        `/api/place-photo?name=${encodeURIComponent(`places/test/photos/photo-${index}`)}&w=800&slug=paid-place-${index}`,
      // Every submitted image is bound to its own original provider record.
      // These are deterministic fixtures, not an exception to publication policy.
      google_photo_policy_passed: true,
      google_photo_attribution: {
        photo_name: `places/test/photos/photo-${index}`,
        google_maps_uri: `https://www.google.com/maps/place/test/data=!3m1!1e3?photoid=photo-${index}`,
        authors: [{ display_name: `Fixture contributor ${index}` }],
      },
    },
  };
  return hit;
}

describe("submitted search photo budget", () => {
  beforeEach(() => {
    mocks.search.mockReset().mockReturnValue([]);
    mocks.eventSnapshot.mockReset().mockResolvedValue({ publicEvents: [], sourceHealth: { degraded: false } });
  });

  it("renders no more than four paid photos across the visible and collapsed results", async () => {
    mocks.search.mockReturnValue(
      Array.from({ length: 20 }, (_, index) => paidPlaceHit(index + 1)),
    );

    const page = await SearchPage({
      searchParams: Promise.resolve({ q: "restaurants" }),
    });
    const html = renderToStaticMarkup(page);

    // Three compact native images plus one selected visible-byte lead are the
    // same four eligible slots; the offscreen lead has not fetched bytes yet.
    expect((html.match(/data-search-place-visual="google"/g) ?? [])).toHaveLength(4);
    expect((html.match(/<img\b/g) ?? [])).toHaveLength(3);
    expect(html).toContain('data-search-place-photo-bytes="idle"');
    expect(html).toContain("photo-4");
    expect(html).not.toContain("photo-5");
    expect(html).not.toContain("photo-20");
  });

  it("uses one photo-led exact place with native details/map links retaining the search origin", async () => {
    const hit = paidPlaceHit(1);
    if (hit.type !== "place") throw new Error("Expected place fixture");
    hit.place = { ...hit.place, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum",
      google_photo_url: undefined, google_photo_attribution: undefined };
    mocks.search.mockReturnValue([hit]);
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "Schifferstadt", in: "frederick", kind: "place" }) }));
    expect((html.match(/data-search-place-lead/g) ?? [])).toHaveLength(1);
    expect(html).toContain("%2Fhistory-photos%2Fschifferstadt.jpg");
    expect(html).toContain('aria-label="View place: Schifferstadt Architectural Museum"');
    expect(html).toContain('aria-label="Map: Schifferstadt Architectural Museum"');
    expect(html).toContain("returnTo=%2Fsearch%3Fq%3DSchifferstadt%26in%3Dfrederick%26kind%3Dplace");
    expect(html).toContain("in=frederick");
    expect(html).toContain("Hours not posted");
  });

  it("does not promote a photographic place above the actual first ranked tool", async () => {
    const hit = paidPlaceHit(1);
    if (hit.type !== "place") throw new Error("Expected place fixture");
    hit.place = { ...hit.place, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum",
      google_photo_url: undefined, google_photo_attribution: undefined };
    mocks.search.mockReturnValue([{ type: "page", score: 200, page: { title: "Official service first", href: "/contacts", blurb: "Actual first ranked fixture" } }, hit]);
    const html = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "Schifferstadt" }) }));
    expect(html).not.toContain("data-search-place-lead");
    expect(html.indexOf("Official service first")).toBeLessThan(html.indexOf("Schifferstadt Architectural Museum"));
  });

  it("loads the event archive for an exact title without event trigger words", async () => {
    const eventPool = [{ slug: "radius-investor-showcase", title: "Radius Investor Showcase" }];
    mocks.eventSnapshot.mockResolvedValue({ publicEvents: eventPool, sourceHealth: { degraded: false } });
    await SearchPage({ searchParams: Promise.resolve({ q: "Radius Investor Showcase" }) });
    expect(mocks.eventSnapshot).toHaveBeenCalledOnce();
    expect(mocks.search).toHaveBeenCalledWith("Radius Investor Showcase", 80, eventPool, expect.objectContaining({ resultKind: "all" }));
  });

  it("passes an explicit Events selection into retrieval", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "coffee", kind: "event" }) });
    expect(mocks.eventSnapshot).toHaveBeenCalledOnce();
    expect(mocks.search).toHaveBeenCalledWith("coffee", 80, [], expect.objectContaining({ resultKind: "event" }));
  });

  it.each(["place", "page"])("does not load event data for %s-only retrieval", async (kind) => {
    await SearchPage({ searchParams: Promise.resolve({ q: "coffee", kind }) });
    expect(mocks.eventSnapshot).not.toHaveBeenCalled();
    expect(mocks.search).toHaveBeenCalledWith("coffee", 80, undefined, expect.objectContaining({ resultKind: kind }));
  });

  it("gives the event archive the browse deadline and never ranks curated seeds as a fallback", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "concerts" }) });
    expect(mocks.eventSnapshot).toHaveBeenCalledWith(
      expect.any(Date),
      {
        timeoutMs: 2_500,
        seedFallback: false,
        caller: "search",
      },
    );
  });

  it.each([
    ["All matches", { q: "concerts" }, "all"],
    ["the Events tab", { q: "concerts", kind: "event" }, "event"],
  ] as const)("says events did not load and ranks no seed events on %s when the archive is empty", async (_label, params, resultKind) => {
    mocks.eventSnapshot.mockResolvedValue({
      publicEvents: [],
      sourceHealth: { degraded: true },
    });

    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve(params) }),
    );

    expect(mocks.search).toHaveBeenCalledWith(
      "concerts",
      80,
      [],
      expect.objectContaining({ resultKind }),
    );
    expect(html).toContain("Events didn&#x27;t load.");
    expect(html).toContain("See all events →");
    expect(html).toContain('href="/events"');
    expect(html).not.toContain("may be incomplete");
    expect(html).not.toContain("The current event schedule is unavailable");
    expect(html).not.toContain("There are no matches for");
    expect(html).not.toContain("Need a recommendation or a plan?");
    expect(html).not.toContain("Catoctin Colorfest");
  });

  it("does not show the events-did-not-load line when a last-good archive returns real events", async () => {
    const eventPool = [{ slug: "archive-event-2026-07-31", title: "Archive event" }];
    mocks.eventSnapshot.mockResolvedValue({
      publicEvents: eventPool,
      sourceHealth: { degraded: false },
      servedFromLastGood: true,
    });

    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: "Archive event" }) }),
    );

    expect(mocks.search).toHaveBeenCalledWith(
      "Archive event",
      80,
      eventPool,
      expect.objectContaining({ resultKind: "all" }),
    );
    expect(html).not.toContain("Events didn&#x27;t load.");
    expect(html).not.toContain("may be incomplete");
  });
});
