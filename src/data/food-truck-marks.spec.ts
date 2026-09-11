import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import MARKS from "./food-truck-marks.json";
import { FOOD_TRUCK_BY_SLUG } from "./food-trucks";

describe("food-truck identity marks", () => {
  it("only names trucks in the curated roster", () => {
    const unknown = Object.keys(MARKS).filter((slug) => !FOOD_TRUCK_BY_SLUG.has(slug));
    expect(unknown).toEqual([]);
  });

  it("keeps a vendor-controlled source and source page for every mark", () => {
    const incomplete = Object.entries(MARKS).filter(
      ([, mark]) =>
        !mark.source.startsWith("http") ||
        !mark.sourcePage.startsWith("https://") ||
        !/^\d{4}-\d{2}-\d{2}$/.test(mark.fetched) ||
        !["light", "dark"].includes(mark.plate),
    );
    expect(incomplete).toEqual([]);
  });

  it("ships every curated mark as a local public asset", () => {
    const missing = Object.values(MARKS)
      .map((mark) => mark.file)
      .filter((file) => !existsSync(path.join(process.cwd(), "public", file.replace(/^\//, ""))));
    expect(missing).toEqual([]);
  });
});
