import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CompassHeading", () => {
  it("is a server component that paints the page title without client data", () => {
    const source = readFileSync("src/components/nav/CompassHeading.tsx", "utf8");
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).toContain("What do you need?");
    expect(source).toContain("Compass");
    expect(source).toContain("font-editorial");
  });

  it("is the heading used by the Compass route and its loading shell", () => {
    const page = readFileSync("src/app/(app)/compass/page.tsx", "utf8");
    const loading = readFileSync("src/app/(app)/compass/loading.tsx", "utf8");
    const modal = readFileSync("src/app/(app)/@modal/(.)compass/page.tsx", "utf8");

    expect(page).toContain("<CompassHeading");
    expect(loading).toContain("<CompassHeading");
    expect(modal).toContain("<CompassHeading");
  });
});
