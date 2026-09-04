import { existsSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FairColoringBookCard, {
  COLOR_FREDERICK_URL,
  FAIR_COLORING_BOOK_COVER_URL,
  FAIR_COLORING_BOOK_PDF_URL,
} from "./FairColoringBookCard";

describe("FairColoringBookCard", () => {
  it("ships both public assets behind the card's stable URLs", () => {
    for (const assetUrl of [
      FAIR_COLORING_BOOK_PDF_URL,
      FAIR_COLORING_BOOK_COVER_URL,
    ]) {
      expect(
        existsSync(path.join(process.cwd(), "public", assetUrl)),
        `${assetUrl} must resolve from public/`,
      ).toBe(true);
    }
  });

  it("offers the verified printable without presenting it as official Fair material", () => {
    const html = renderToStaticMarkup(createElement(FairColoringBookCard));

    expect(html).toContain("Fair Nights");
    expect(html).toContain("free, independent 12-page Frederick coloring book");
    expect(html).toContain(`href="${FAIR_COLORING_BOOK_PDF_URL}"`);
    expect(html).toContain("download=\"\"");
    expect(html).toContain(`src="${FAIR_COLORING_BOOK_COVER_URL}"`);
    expect(html).not.toContain("official Fair coloring book");
  });

  it("keeps the paid-book handoff secondary, exact, and safely external", () => {
    const html = renderToStaticMarkup(createElement(FairColoringBookCard));

    expect(html).toContain(`href="${COLOR_FREDERICK_URL}"`);
    expect(html).toContain("More Frederick pages");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("gives both links full touch targets and labels the decorative preview correctly", () => {
    const html = renderToStaticMarkup(createElement(FairColoringBookCard));

    expect(html.match(/tap-44/g)).toHaveLength(2);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-labelledby="fair-coloring-book-heading"');
    expect(html).toContain(
      'aria-describedby="fair-coloring-book-description fair-coloring-book-format"',
    );
  });
});
