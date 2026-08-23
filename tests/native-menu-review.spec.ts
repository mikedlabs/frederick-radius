import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { importNativeMenu } from "@/lib/commerce/native-menu-ingest";
import {
  listNativeMenuReviewCandidates,
  prepareNativeMenuReviewDraft,
  stageNativeMenuForReview,
  type NativeMenuReviewSql,
} from "@/lib/commerce/native-menu-review";

const fixture = readFileSync(
  fileURLToPath(
    new URL("./fixtures/native-menu/authorized-menu.json", import.meta.url),
  ),
  "utf8",
);

const sourceId = "11111111-1111-4111-8111-111111111111";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ? ").replace(/\s+/g, " ").trim();
}

function fakeDatabase(options: {
  protectSource?: boolean;
  incompleteItems?: boolean;
} = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const transaction: NativeMenuReviewSql = async (strings, ...values) => {
    const text = queryText(strings);
    calls.push({ text, values });
    if (text.includes("insert into public.menu_sources")) {
      return options.protectSource ? [] : [{ id: sourceId }];
    }
    if (text.includes("insert into public.native_menus")) {
      return [{ id: "menu-1" }];
    }
    if (text.includes("insert into public.menu_sections")) {
      return [{ id: "section-1" }];
    }
    if (text.includes("insert into public.menu_items")) {
      return options.incompleteItems ? [] : [{ id: "item-1" }];
    }
    return [];
  };
  const begin = vi.fn(async <T>(work: (sql: NativeMenuReviewSql) => Promise<T>) =>
    work(transaction),
  );
  const root = Object.assign(
    (async () => []) as NativeMenuReviewSql,
    { begin },
  );
  return { root, begin, calls };
}

describe("native menu review intake", () => {
  it("converts authorized claims into explicit review evidence", () => {
    const document = importNativeMenu(fixture, { format: "json" });
    const draft = prepareNativeMenuReviewDraft(document);

    expect(draft.source).toMatchObject({
      placeSlug: "test-kitchen-frederick",
      provider: "owner_upload",
      sourceKind: "owner_upload",
      provenanceMethod: "business_submission",
      checkedAt: "2026-07-29T14:15:00.000Z",
    });
    expect(draft.source.sourceKey).toMatch(/^radius:[a-f0-9]{24}$/);
    expect(draft.source.provenance).toMatchObject({
      authorizationBasis: "owner_upload",
      sourcePublishedAt: "2026-07-28T16:00:00.000Z",
      stagedFor: "human_review",
    });
    expect(draft.menus[0]).toMatchObject({
      sourceKey: "dinner",
      menuType: "dinner",
    });
    expect(draft.items[0]).toMatchObject({
      sourceKey: "fried-chicken-sandwich",
      priceMinor: 1600,
      priceDisplay: "$16.00",
      availabilityStatus: "available",
      availabilityEvidence: "business_submission",
      availabilityCheckedAt: "2026-07-29T14:15:00.000Z",
      dietaryTags: ["dairy_free"],
      dietaryEvidence: "business_submission",
    });
  });

  it("stages one complete tree atomically and cannot publish it", async () => {
    const document = importNativeMenu(fixture, { format: "json" });
    const database = fakeDatabase();

    await expect(
      stageNativeMenuForReview(document, database.root),
    ).resolves.toEqual({
      sourceId,
      placeSlug: "test-kitchen-frederick",
      sourceKey: expect.stringMatching(/^radius:/),
      menus: 1,
      sections: 1,
      items: 1,
      recordStatus: "draft",
      verificationStatus: "unverified",
      freshnessStatus: "unknown",
      publiclyVisible: false,
      reviewRequired: true,
    });

    expect(database.begin).toHaveBeenCalledOnce();
    const sourceInsert = database.calls.find((call) =>
      call.text.includes("insert into public.menu_sources"),
    );
    expect(sourceInsert?.text).toContain("'draft'");
    expect(sourceInsert?.text).toContain("'unverified'");
    expect(sourceInsert?.text).toContain("'unknown'");
    expect(sourceInsert?.text).toContain("published_at = null");
    expect(sourceInsert?.text).toContain(
      "where menu_sources.record_status = 'draft' and menu_sources.verification_status = 'unverified'",
    );

    for (const table of ["native_menus", "menu_sections", "menu_items"]) {
      const insert = database.calls.find((call) =>
        call.text.includes(`insert into public.${table}`),
      );
      expect(insert?.text).toContain("'draft'");
      expect(insert?.text).toContain("'unknown'");
    }

    const menuInsert = database.calls.find((call) =>
      call.text.includes("insert into public.native_menus"),
    );
    const serializedMenus = menuInsert?.values.find(
      (value) => typeof value === "string" && value.startsWith("["),
    );
    expect(JSON.parse(String(serializedMenus))).toEqual([
      expect.objectContaining({
        source_key: "dinner",
        menu_type: "dinner",
        checked_at: "2026-07-29T14:15:00.000Z",
      }),
    ]);
  });

  it("refuses to replace a reviewed or published source", async () => {
    const document = importNativeMenu(fixture, { format: "json" });
    const database = fakeDatabase({ protectSource: true });

    await expect(
      stageNativeMenuForReview(document, database.root),
    ).rejects.toMatchObject({
      code: "protected_source",
    });
    expect(
      database.calls.some((call) =>
        call.text.includes("delete from public.native_menus"),
      ),
    ).toBe(false);
  });

  it("rolls back when any level of the menu tree is incomplete", async () => {
    const document = importNativeMenu(fixture, { format: "json" });
    const database = fakeDatabase({ incompleteItems: true });

    await expect(
      stageNativeMenuForReview(document, database.root),
    ).rejects.toMatchObject({
      code: "write_failed",
    });
  });

  it("requires transactional storage", async () => {
    const document = importNativeMenu(fixture, { format: "json" });
    const database = (async () => []) as NativeMenuReviewSql;

    await expect(
      stageNativeMenuForReview(document, database),
    ).rejects.toMatchObject({
      code: "transaction_required",
    });
  });

  it("lists only the private draft review queue with a bounded query", async () => {
    let text = "";
    let values: unknown[] = [];
    const database: NativeMenuReviewSql = async (strings, ...parameters) => {
      text = queryText(strings);
      values = parameters;
      return [{
        source_id: sourceId,
        place_slug: "cafe-nola",
        provider: "owner_upload",
        source_label: "Owner-submitted menu for cafe-nola",
        source_url: "https://www.cafenola.com/menu",
        checked_at: new Date("2026-08-22T12:00:00.000Z"),
        updated_at: "2026-08-22T12:01:00.000Z",
        menu_count: 2,
        section_count: "5",
        item_count: 42,
      }];
    };

    await expect(
      listNativeMenuReviewCandidates({ database, limit: 999 }),
    ).resolves.toEqual([{
      sourceId,
      placeSlug: "cafe-nola",
      provider: "owner_upload",
      sourceLabel: "Owner-submitted menu for cafe-nola",
      sourceUrl: "https://www.cafenola.com/menu",
      checkedAt: "2026-08-22T12:00:00.000Z",
      updatedAt: "2026-08-22T12:01:00.000Z",
      menus: 2,
      sections: 5,
      items: 42,
      recordStatus: "draft",
      verificationStatus: "unverified",
      publiclyVisible: false,
    }]);
    expect(text).toContain("where source.record_status = 'draft'");
    expect(text).toContain("source.verification_status = 'unverified'");
    expect(text).not.toContain("source.record_status = 'published'");
    expect(values.at(-1)).toBe(200);
  });
});
