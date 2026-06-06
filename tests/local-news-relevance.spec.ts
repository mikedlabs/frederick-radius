import { describe, it, expect } from "vitest";
import { isFrederickRelevant, FREDERICK_RELEVANCE } from "@/lib/integrations/local-news";
import type { LocalNewsSource } from "@/data/local-news-sources";
import type { LocalNewsItem } from "@/lib/integrations/local-news";

const FNP: LocalNewsSource = { id: "fnp", label: "FNP", feedUrl: "x", accent: "x", scope: "frederick" };
const MOCO: LocalNewsSource = { id: "moco", label: "MoCo", feedUrl: "x", accent: "x", scope: "regional" };
const MDM: LocalNewsSource = { id: "mdm", label: "MD Matters", feedUrl: "x", accent: "x", scope: "regional" };

function item(source: LocalNewsSource, title: string, url = "https://example.com/x"): LocalNewsItem {
  return { source, title, url, publishedAt: 1 };
}

describe("Frederick news relevance gate", () => {
  it("keeps a Frederick-scoped (FNP) item", () => {
    expect(isFrederickRelevant(item(FNP, "Downtown Frederick restaurant reopens"))).toBe(true);
  });

  it("keeps an FNP item even without an explicit Frederick keyword (trusted local source)", () => {
    expect(isFrederickRelevant(item(FNP, "County council passes budget"))).toBe(true);
  });

  it("removes a MoCo Ocean City item (regional, no Frederick hook)", () => {
    expect(
      isFrederickRelevant(item(MOCO, "Ocean City Explains Why No One Is Allowed on the Beach Overnight")),
    ).toBe(false);
  });

  it("removes a Maryland Matters statewide item (regional, no Frederick hook)", () => {
    expect(
      isFrederickRelevant(item(MDM, "Maryland abortion fund sees record donations after ruling")),
    ).toBe(false);
  });

  it("keeps a regional item that mentions a Frederick County place (Urbana)", () => {
    expect(
      isFrederickRelevant(item(MOCO, "Burlington replacing Staples at 5557 Urbana Pike")),
    ).toBe(true);
  });

  it("keeps a regional item that names Frederick County directly", () => {
    expect(isFrederickRelevant(item(MDM, "Frederick County delegation backs transit bill"))).toBe(true);
  });

  it("relevance regex matches municipalities + landmarks, not Montgomery noise", () => {
    expect(FREDERICK_RELEVANCE.test("Thurmont Main Street festival")).toBe(true);
    expect(FREDERICK_RELEVANCE.test("Catoctin Mountain trail reopens")).toBe(true);
    expect(FREDERICK_RELEVANCE.test("Olney Pickle Fest returns Sunday")).toBe(false);
    expect(FREDERICK_RELEVANCE.test("Rio Lakefront openings and closings")).toBe(false);
  });
});
