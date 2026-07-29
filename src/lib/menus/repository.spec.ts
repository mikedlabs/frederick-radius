import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  getPublishedMenuForPlace,
  searchPublishedMenuItems,
} from "./repository";

const checkedAt = new Date("2026-07-29T12:00:00.000Z");
const validUntil = new Date("2026-07-30T12:00:00.000Z");
const publishedAt = new Date("2026-07-29T12:01:00.000Z");

function row(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source_id: "source-1",
    source_place_slug: "cafe-nola",
    source_provider: "toast",
    source_kind: "pos_api",
    source_key: "toast-cafe-nola",
    source_label: "Cafe Nola on Toast",
    source_url: "https://www.toasttab.com/cafe-nola",
    source_external_merchant_id: "merchant-1",
    source_provenance_method: "merchant_authorized",
    source_provenance: { account: "merchant-authorized" },
    source_record_status: "published",
    source_verification_status: "verified",
    source_freshness_status: "current",
    source_source_updated_at: checkedAt,
    source_checked_at: checkedAt,
    source_valid_until: validUntil,
    source_published_at: publishedAt,

    menu_id: "menu-1",
    menu_source_key: "main",
    menu_name: "Main menu",
    menu_description: "Breakfast, lunch, and dinner",
    menu_type: "main",
    menu_currency: "USD",
    menu_canonical_url: "https://www.toasttab.com/cafe-nola/menu",
    menu_provenance_url: "https://www.toasttab.com/cafe-nola/menu",
    menu_provenance: { providerMenuId: "menu-main" },
    menu_record_status: "published",
    menu_freshness_status: "current",
    menu_source_updated_at: checkedAt,
    menu_checked_at: checkedAt,
    menu_valid_until: validUntil,
    menu_published_at: publishedAt,
    menu_sort_order: 0,

    section_id: "section-1",
    section_source_key: "breakfast",
    section_name: "Breakfast",
    section_description: null,
    section_provenance_url: "https://www.toasttab.com/cafe-nola/menu",
    section_provenance: {},
    section_record_status: "published",
    section_freshness_status: "current",
    section_source_updated_at: checkedAt,
    section_checked_at: checkedAt,
    section_valid_until: validUntil,
    section_published_at: publishedAt,
    section_sort_order: 0,

    item_id: "item-1",
    item_source_key: "breakfast-sandwich",
    item_name: "Breakfast Sandwich",
    item_description: "Egg, cheddar, and choice of bacon or sausage",
    item_price_minor: 1250,
    item_price_currency: "USD",
    item_price_display: "$12.50",
    item_availability_status: "available",
    item_availability_evidence: "provider_api",
    item_availability_checked_at: checkedAt,
    item_dietary_tags: ["gluten-free-option"],
    item_dietary_evidence: "official_menu",
    item_allergen_statement: "Contains egg and dairy",
    item_calorie_count: null,
    item_order_url: "https://www.toasttab.com/cafe-nola/order",
    item_provenance_url: "https://www.toasttab.com/cafe-nola/menu",
    item_provenance: { providerItemId: "breakfast-sandwich" },
    item_record_status: "published",
    item_freshness_status: "current",
    item_source_updated_at: checkedAt,
    item_checked_at: checkedAt,
    item_valid_until: validUntil,
    item_published_at: publishedAt,
    item_sort_order: 0,
    search_rank: 0.72,
    ...overrides,
  };
}

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

describe("getPublishedMenuForPlace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("distinguishes missing database configuration from an empty menu", async () => {
    mocks.getSql.mockReturnValue(null);

    await expect(getPublishedMenuForPlace("cafe-nola")).resolves.toEqual({
      status: "unavailable",
      reason: "not_configured",
      data: null,
    });
  });

  it("returns not_found only after a database query completes", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    mocks.getSql.mockReturnValue(sql);

    await expect(getPublishedMenuForPlace("missing-place")).resolves.toEqual({
      status: "not_found",
      data: null,
    });
    expect(sql).toHaveBeenCalledOnce();
  });

  it("returns a nested, plain-serializable current menu tree", async () => {
    const sql = vi.fn().mockResolvedValue([
      row(),
      row({
        item_id: "item-2",
        item_source_key: "latte",
        item_name: "Latte",
        item_description: null,
        item_price_minor: 525,
        item_price_display: "$5.25",
        item_availability_status: "unknown",
        item_availability_evidence: "not_provided",
        item_availability_checked_at: null,
        item_dietary_tags: [],
        item_dietary_evidence: "not_provided",
        item_sort_order: 1,
      }),
    ]);
    mocks.getSql.mockReturnValue(sql);

    const result = await getPublishedMenuForPlace("cafe-nola");

    expect(result).toMatchObject({
      status: "ok",
      data: {
        placeSlug: "cafe-nola",
        menus: [
          {
            id: "menu-1",
            recordStatus: "published",
            freshnessStatus: "current",
            source: {
              provider: "toast",
              verificationStatus: "verified",
              checkedAt: "2026-07-29T12:00:00.000Z",
            },
            sections: [
              {
                id: "section-1",
                items: [
                  {
                    id: "item-1",
                    priceMinor: 1250,
                    availabilityStatus: "available",
                    availabilityEvidence: "provider_api",
                    dietaryEvidence: "official_menu",
                  },
                  {
                    id: "item-2",
                    priceMinor: 525,
                    availabilityStatus: "unknown",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("applies published, verified, current, and unexpired filters in SQL", async () => {
    let text = "";
    const sql = vi.fn((strings: TemplateStringsArray) => {
      text = queryText(strings);
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    await getPublishedMenuForPlace("cafe-nola");

    expect(text).toContain("ms.record_status = 'published'");
    expect(text).toContain("ms.verification_status = 'verified'");
    expect(text).toContain("ms.freshness_status = 'current'");
    expect(text).toContain("ms.valid_until > now()");
    expect(text).toContain("m.record_status = 'published'");
    expect(text).toContain("m.valid_until > now()");
    expect(text).toContain("s.record_status = 'published'");
    expect(text).toContain("s.valid_until > now()");
    expect(text).toContain("i.record_status = 'published'");
    expect(text).toContain("i.valid_until > now()");
  });

  it("reports query failure without leaking the database error", async () => {
    const sql = vi.fn().mockRejectedValue(
      new Error("postgres://user:secret@example.invalid/menu"),
    );
    mocks.getSql.mockReturnValue(sql);

    await expect(getPublishedMenuForPlace("cafe-nola")).resolves.toEqual({
      status: "unavailable",
      reason: "query_failed",
      data: null,
    });
    expect(console.warn).toHaveBeenCalledWith(
      "[native-menu] published menu query failed",
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret",
    );
  });
});

describe("searchPublishedMenuItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns an empty result for empty input without opening the database", async () => {
    await expect(searchPublishedMenuItems("   ")).resolves.toEqual({
      status: "ok",
      items: [],
    });
    expect(mocks.getSql).not.toHaveBeenCalled();
  });

  it("keeps the query and bounded limit as SQL parameters", async () => {
    let text = "";
    let values: unknown[] = [];
    const sql = vi.fn(
      (strings: TemplateStringsArray, ...parameters: unknown[]) => {
        text = queryText(strings);
        values = parameters;
        return Promise.resolve([]);
      },
    );
    mocks.getSql.mockReturnValue(sql);
    const attack = "birria tacos'); delete from menu_items; --";

    await searchPublishedMenuItems(attack, { limit: 999 });

    expect(text).not.toContain(attack);
    expect(values).toContain(attack);
    expect(values.at(-1)).toBe(50);
  });

  it("returns source, menu, section, item, evidence, and rank", async () => {
    const sql = vi.fn().mockResolvedValue([row()]);
    mocks.getSql.mockReturnValue(sql);

    await expect(
      searchPublishedMenuItems("breakfast sandwich", { limit: 5 }),
    ).resolves.toMatchObject({
      status: "ok",
      items: [
        {
          score: 0.72,
          source: {
            placeSlug: "cafe-nola",
            provider: "toast",
            provenanceMethod: "merchant_authorized",
          },
          menu: { name: "Main menu" },
          section: { name: "Breakfast" },
          item: {
            name: "Breakfast Sandwich",
            availabilityEvidence: "provider_api",
            availabilityCheckedAt: "2026-07-29T12:00:00.000Z",
            dietaryTags: ["gluten-free-option"],
            dietaryEvidence: "official_menu",
          },
        },
      ],
    });
  });

  it("requires the complete source-to-item chain to be published and current", async () => {
    let text = "";
    const sql = vi.fn((strings: TemplateStringsArray) => {
      text = queryText(strings);
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    await searchPublishedMenuItems("latte");

    for (const alias of ["ms", "m", "s", "i"]) {
      expect(text).toContain(`${alias}.record_status = 'published'`);
      expect(text).toContain(`${alias}.freshness_status = 'current'`);
      expect(text).toContain(`${alias}.valid_until > now()`);
    }
    expect(text).toContain("ms.verification_status = 'verified'");
    expect(text).toContain("websearch_to_tsquery('english'");
  });

  it("distinguishes a failed item query from no matches", async () => {
    const sql = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    mocks.getSql.mockReturnValue(sql);

    await expect(searchPublishedMenuItems("latte")).resolves.toEqual({
      status: "unavailable",
      reason: "query_failed",
      items: [],
    });
  });
});
