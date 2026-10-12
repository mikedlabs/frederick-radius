import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MomentPhotoCreditLine from "./MomentPhotoCreditLine";

describe("MomentPhotoCreditLine", () => {
  it("links the author to the file page and the license to its deed", () => {
    const html = renderToStaticMarkup(
      createElement(MomentPhotoCreditLine, {
        credit: {
          depicts: "Thurmont Town Square Park, the town center.",
          author: "CraigShipp.com Photos",
          license: "CC BY-SA 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Thurmont_Town_Square_Park.jpg",
        },
      }),
    );

    expect(html).toContain("Thurmont Town Square Park, the town center. Photo: ");
    expect(html).toContain('href="https://commons.wikimedia.org/wiki/File:Thurmont_Town_Square_Park.jpg"');
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/2.0/"');
    expect(html).toContain('rel="noopener noreferrer license"');
  });

  it("prints an unknown license as text", () => {
    const html = renderToStaticMarkup(
      createElement(MomentPhotoCreditLine, {
        credit: {
          depicts: "A view",
          author: "Someone",
          license: "Custom terms",
          licenseUrl: null,
          sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
        },
      }),
    );

    expect(html).toContain("Custom terms");
    expect(html).not.toContain('rel="noopener noreferrer license"');
  });
});
