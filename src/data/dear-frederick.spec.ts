import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LETTERS, PUBLISHED_LETTERS } from "./dear-frederick";

describe("Dear Frederick publication boundary", () => {
  it("keeps unpublished submissions out of static source and public assets", () => {
    expect(LETTERS.every((letter) => letter.published)).toBe(true);
    expect(PUBLISHED_LETTERS).toHaveLength(LETTERS.length);

    const referencedScans = LETTERS.map((letter) =>
      letter.image.replace("/dear-frederick/", ""),
    ).sort();
    const publicScans = readdirSync("public/dear-frederick")
      .filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file))
      .sort();

    expect(publicScans).toEqual(referencedScans);
  });
});
