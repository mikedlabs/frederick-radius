import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/**
 * Today's Browse disclosure is a display:contents <details> inside a grid,
 * and that combination has a rendering trap no type or unit test sees:
 * current engines wrap a details' non-summary content in a ::details-content
 * block box, so the WRAPPER is the grid item and the panel's own col-span-3
 * is inert — the panel renders squeezed into the heading column on phones
 * (measured: 298px of a 400px row in the pinned Chromium). The fix is a
 * grid-column rule on the wrapper, which lives in globals.css, plus the
 * class hook on the details, which lives in page.tsx. Neither file fails
 * anything if the other half is renamed or deleted, so this spec holds the
 * pair together.
 */
describe("Today Browse disclosure grid placement", () => {
  const page = read("src/app/(app)/today/page.tsx");
  const css = read("src/app/globals.css");

  it("keeps the class hook on the display:contents details", () => {
    expect(page).toMatch(/<details className="[^"]*\bcontents\b[^"]*\btoday-browse\b[^"]*"/);
  });

  it("spans the ::details-content wrapper across the grid row", () => {
    expect(css).toMatch(
      /\.today-browse::details-content\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/,
    );
  });

  it("keeps the direct col-span fallback for engines without the wrapper", () => {
    const panel = page.match(/<details className="[^"]*today-browse[\s\S]{0,900}?<div\s+className="([^"]+)"/);
    expect(panel, "Browse panel div not found inside the details").toBeTruthy();
    expect(panel![1]).toContain("col-span-3");
  });
});
