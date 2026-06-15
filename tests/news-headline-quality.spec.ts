import { describe, it, expect } from "vitest";
import { isPublishableHeadline } from "@/lib/integrations/news";

const h = (title: string, source = "The Frederick News-Post") => ({ title, source });

describe("getLocalHeadlines boundary quality gate", () => {
  describe("drops URL-only titles", () => {
    it("drops a full https:// title (the reported leak)", () => {
      expect(
        isPublishableHeadline(
          h("https://marylandreporter.com/2025/10/25/freedom-bank-wins-an-award-in-dubai", "MarylandReporter.com"),
        ),
      ).toBe(false);
    });

    it("drops an http:// title", () => {
      expect(isPublishableHeadline(h("http://example.com/story"))).toBe(false);
    });

    it("drops a www. title", () => {
      expect(isPublishableHeadline(h("www.fredericknewspost.com/news/thing"))).toBe(false);
    });

    it("drops a spaceless bare-domain path with no scheme", () => {
      expect(isPublishableHeadline(h("marylandreporter.com/2025/10/25/freedom-bank"))).toBe(false);
    });
  });

  describe("drops obituary listings", () => {
    it("drops a title matching the obituary pattern", () => {
      expect(
        isPublishableHeadline(h("Daniel Pollen Obituary (1949 - 2026) - Mount Airy, MD - The Frederick News-Post")),
      ).toBe(false);
    });

    it("drops the plural 'obituaries' form", () => {
      expect(isPublishableHeadline(h("Frederick County obituaries for the week"))).toBe(false);
    });

    it("drops an 'In Memoriam' / 'death notice' listing", () => {
      expect(isPublishableHeadline(h("In Memoriam: longtime resident"))).toBe(false);
      expect(isPublishableHeadline(h("Death notice for a community figure"))).toBe(false);
    });

    it("drops by source even when the title is generic (Legacy | Obituary Search)", () => {
      expect(isPublishableHeadline(h("Jacqueline Stover", "Legacy | Obituary Search"))).toBe(false);
      expect(isPublishableHeadline(h("Recent passings", "Legacy"))).toBe(false);
    });
  });

  describe("keeps real local news (no over-filtering)", () => {
    it("keeps an ordinary headline", () => {
      expect(
        isPublishableHeadline(h("Canterbury Station Dog Park Entrance Construction Begins June 16", "The City of Frederick, MD (.gov)")),
      ).toBe(true);
    });

    it("keeps a headline that merely contains a URL-looking word but isn't a URL title", () => {
      expect(isPublishableHeadline(h("Visit fredericknewspost.com for the full schedule, organizers say"))).toBe(true);
    });

    it("keeps a storm story (regression: the WBAL example beside the obituaries)", () => {
      expect(isPublishableHeadline(h("'It was just over instantly': Homeowner describes the storm's force", "WBAL-TV"))).toBe(true);
    });

    it("drops an empty/whitespace title", () => {
      expect(isPublishableHeadline(h("   "))).toBe(false);
    });
  });
});
