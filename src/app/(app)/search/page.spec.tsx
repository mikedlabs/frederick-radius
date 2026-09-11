import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchHit } from "@/lib/search";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  eventSnapshot: vi.fn(),
}));

vi.mock("@/lib/search", () => ({ qualifiedSearch: (...args: unknown[]) => ({ hits: mocks.search(...args), meta: { qualifiers: {} } }), isEventSearchIntent: () => false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/loaders/todayEventSnapshot", () => ({ loadEventArchiveSnapshot: (...args: unknown[]) => mocks.eventSnapshot(...args), TODAY_EVENT_SNAPSHOT_TIMEOUT_MS: 1000 }));
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
  return {
    type: "place",
    score: 100 - index,
    place: {
      slug: `paid-place-${index}`,
      name: `Paid place ${index}`,
      category: "restaurant",
      address: `${index} Market Street`,
      city: "Frederick",
      municipality: "frederick",
      google_photo_url:
        `/api/place-photo?name=${encodeURIComponent(`places/test/photos/photo-${index}`)}&w=800`,
    },
  } as SearchHit;
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

    expect((html.match(/<img\b/g) ?? [])).toHaveLength(4);
    expect(html).toContain("photo-4");
    expect(html).not.toContain("photo-5");
    expect(html).not.toContain("photo-20");
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
});
