import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PageChapter from "./PageChapter";

describe("PageChapter", () => {
  it("groups content with an accessible label and a decorative folio", () => {
    const html = renderToStaticMarkup(
      createElement(
        PageChapter,
        {
          label: "Around town",
          index: "02",
          tone: "forest",
        },
        createElement("section", null, createElement("h2", null, "Local guides")),
      ),
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Around town"');
    expect(html).toContain("content-chapter--forest");
    expect(html).toContain(">02<");
    expect(html).toContain(">Around town<");
    expect(html).toContain("<h2>Local guides</h2>");
  });
});
