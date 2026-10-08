import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PageChapter from "./PageChapter";

describe("PageChapter", () => {
  it("groups content with an accessible label and a quiet folio", () => {
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
    expect(html).toMatch(/<span aria-hidden="true" data-chapter-folio="true" class="text-meta-lg [^"]*tabular-nums"[^>]*>02<\/span>/);
    expect(html).toContain("<h2>Local guides</h2>");
  });

  it("names the chapter with a real h2 in the SectionHeading primary register", () => {
    const html = renderToStaticMarkup(
      createElement(PageChapter, { label: "Follow the day", variant: "plain" }),
    );
    const heading = html.match(/<h2 class="([^"]*)" style="([^"]*)">([^<]*)<\/h2>/);

    expect(heading).not.toBeNull();
    expect(heading![1].split(" ")).toContain("text-title");
    expect(heading![2]).toBe("color:var(--app-ink)");
    expect(heading![3]).toBe("Follow the day");
    // The heading is exposed, not hidden behind an aria-hidden register.
    expect(html).not.toMatch(/content-chapter__register"[^>]*aria-hidden/);
    // The tick follows the chapter tone.
    expect(html).toContain("background:var(--content-chapter-accent, var(--app-brand))");
  });

  it("drops the tiny tracked caps label and its trailing rule", () => {
    const html = renderToStaticMarkup(
      createElement(PageChapter, { label: "On the schedule", index: "01", tone: "civic" }),
    );

    expect(html).not.toContain("content-chapter__label");
    expect(html).not.toContain("content-chapter__rule");
    expect(html).not.toContain("content-chapter__folio");
    expect(html).not.toMatch(/uppercase|tracking-/);
  });

  it("supports a quiet chapter break without a folio", () => {
    const html = renderToStaticMarkup(
      createElement(
        PageChapter,
        {
          label: "Useful right now",
          variant: "plain",
        },
        createElement("p", null, "Current conditions"),
      ),
    );

    expect(html).toContain("content-chapter--plain");
    expect(html).toContain(">Useful right now</h2>");
    expect(html).not.toContain("data-chapter-folio");
    expect(html).toContain("<p>Current conditions</p>");
  });
});
