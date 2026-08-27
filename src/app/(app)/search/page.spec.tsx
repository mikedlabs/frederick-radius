import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchHit } from "@/lib/search";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
}));

vi.mock("@/lib/search", () => ({ search: mocks.search }));
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
    mocks.search.mockReset();
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
});
