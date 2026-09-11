import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  importNativeMenu,
  MAX_NATIVE_MENU_INPUT_BYTES,
  NativeMenuValidationError,
} from "@/lib/commerce/native-menu-ingest";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/native-menu/${name}`, import.meta.url)),
    "utf8",
  );

function validJson(): Record<string, unknown> {
  return JSON.parse(fixture("authorized-menu.json")) as Record<string, unknown>;
}

describe("native menu ingestion", () => {
  it("normalizes an authorized JSON menu with integer cents and evidence", () => {
    const menu = importNativeMenu(fixture("authorized-menu.json"), { format: "json" });

    expect(menu.placeId).toBe("test-kitchen-frederick");
    expect(menu.source.url).toBe("https://testkitchen.example.com/menu");
    expect(menu.source.checkedAt).toBe("2026-07-29T14:15:00.000Z");
    expect(menu.totals).toEqual({ menus: 1, sections: 1, items: 1 });
    expect(menu.menus[0].sections[0].items[0]).toMatchObject({
      id: "fried-chicken-sandwich",
      priceCents: 1600,
      available: true,
      availabilityEvidence: "owner_attested",
      dietaryTags: ["dairy_free"],
      dietaryEvidence: "owner_attested",
    });
  });

  it("parses quoted CSV fields and produces the same normalized contract", () => {
    const menu = importNativeMenu(fixture("authorized-menu.csv"), { format: "csv" });

    expect(menu.totals).toEqual({ menus: 1, sections: 1, items: 2 });
    expect(menu.menus[0].sections[0].items.map((item) => item.name)).toEqual([
      "Fried Chicken Sandwich",
      "Market Burger",
    ]);
    expect(menu.menus[0].sections[0].items[0].description).toBe(
      "Pickles, slaw, and hot honey",
    );
  });

  it("rejects data that is not explicitly restaurant-authorized", () => {
    const input = validJson();
    input.authorization = { authorized: false, basis: "owner_upload" };

    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/authorization\.authorized must be true/);
  });

  it("rejects duplicate menu, section, and item identifiers", () => {
    const input = validJson();
    const menus = input.menus as Array<Record<string, unknown>>;
    const duplicateMenu = structuredClone(menus[0]);
    menus.push(duplicateMenu);

    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/duplicates/);
  });

  it("rejects negative and fractional prices", () => {
    const negative = validJson();
    const negativeItem = (
      (
        (negative.menus as Array<Record<string, unknown>>)[0]
          .sections as Array<Record<string, unknown>>
      )[0].items as Array<Record<string, unknown>>
    )[0];
    negativeItem.price_cents = -1;
    expect(() =>
      importNativeMenu(JSON.stringify(negative), { format: "json" }),
    ).toThrow(/price_cents must be at least 0/);

    const fractional = validJson();
    const fractionalItem = (
      (
        (fractional.menus as Array<Record<string, unknown>>)[0]
          .sections as Array<Record<string, unknown>>
      )[0].items as Array<Record<string, unknown>>
    )[0];
    fractionalItem.price_cents = 12.5;
    expect(() =>
      importNativeMenu(JSON.stringify(fractional), { format: "json" }),
    ).toThrow(/price_cents must be an integer/);
  });

  it("rejects unsafe URLs and oversized input", () => {
    const input = validJson();
    input.source = {
      provider: "owner_upload",
      url: "https://127.0.0.1/menu",
      checked_at: "2026-07-29T10:15:00-04:00",
    };
    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/source\.url must use a public hostname/);

    input.source = {
      provider: "owner_upload",
      url: "http://testkitchen.example.com/menu",
      checked_at: "2026-07-29T10:15:00-04:00",
    };
    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/source\.url must use https/);

    expect(() =>
      importNativeMenu("x".repeat(MAX_NATIVE_MENU_INPUT_BYTES + 1), {
        format: "json",
      }),
    ).toThrow(/input exceeds/);
  });

  it("rejects availability and dietary claims without explicit evidence", () => {
    const input = validJson();
    const item = (
      (
        (input.menus as Array<Record<string, unknown>>)[0]
          .sections as Array<Record<string, unknown>>
      )[0].items as Array<Record<string, unknown>>
    )[0];
    delete item.availability_evidence;
    delete item.dietary_evidence;

    try {
      importNativeMenu(JSON.stringify(input), { format: "json" });
      throw new Error("expected import to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NativeMenuValidationError);
      expect((error as NativeMenuValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("availability_evidence is required"),
          expect.stringContaining("dietary_evidence is required"),
        ]),
      );
    }
  });

  it("rejects unsupported dietary claims and false provider evidence", () => {
    const input = validJson();
    const item = (
      (
        (input.menus as Array<Record<string, unknown>>)[0]
          .sections as Array<Record<string, unknown>>
      )[0].items as Array<Record<string, unknown>>
    )[0];
    item.dietary_tags = ["healthy"];
    item.availability_evidence = "provider_api";

    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/unsupported value "healthy"/);
    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/provider_api requires a POS source/);
  });

  it("rejects unknown JSON fields instead of silently accepting new claims", () => {
    const input = validJson();
    const item = (
      (
        (input.menus as Array<Record<string, unknown>>)[0]
          .sections as Array<Record<string, unknown>>
      )[0].items as Array<Record<string, unknown>>
    )[0];
    item.allergen_free = true;

    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/allergen_free is not a supported field or claim/);
  });

  it("requires POS sources to come from an OAuth-authorized connection", () => {
    const input = validJson();
    input.source = {
      provider: "toast",
      url: "https://order.toasttab.com/online/test-kitchen",
      checked_at: "2026-07-29T10:15:00-04:00",
    };

    expect(() =>
      importNativeMenu(JSON.stringify(input), { format: "json" }),
    ).toThrow(/POS sources require authorization\.basis pos_oauth/);
  });
});
