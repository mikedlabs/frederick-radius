import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AskComposerFrame,
  AskComposerMark,
  AskComposerSubmit,
} from "./AskComposer";

describe("Ask Radius shared composer", () => {
  it("keeps the Radius mark and one submission contract together", () => {
    const html = renderToStaticMarkup(
      createElement(
        AskComposerFrame,
        { compact: true },
        createElement(AskComposerMark, { compact: true }),
        createElement(AskComposerSubmit),
      ),
    );

    expect(html).toContain("data-ask-composer");
    expect(html).toContain("data-ask-composer-mark");
    expect(html).toContain('aria-label="Ask Radius"');
    expect(html).toContain('type="submit"');
  });

  it("draws a plain 6px field, a 6px submit and a mark without its coral tile", () => {
    const html = renderToStaticMarkup(
      createElement(
        AskComposerFrame,
        null,
        createElement(AskComposerMark),
        createElement(AskComposerSubmit),
      ),
    );

    expect(html).not.toContain("ask-composer ");
    expect(html).not.toMatch(/rounded-full|rounded-\[\d+px\]|shadow/);
    expect(html.match(/rounded-\[var\(--app-radius-md\)\]/g)).toHaveLength(2);
    expect(html).toContain("border-color:var(--app-control-border)");
    expect(html).toContain("background:var(--app-brand-press);color:var(--app-on-brand)");
    // The tiled mark paints a brick squircle; the field mark is strokes only.
    expect(html).not.toMatch(/fill="#[0-9A-Fa-f]{6}"/);
    // Keyboard focus on the text control rings the whole field.
    expect(html).toContain("has-[textarea:focus-visible]:outline-[var(--app-focus)]");
  });

  it("turns the end control into an explicit stop action while loading", () => {
    const html = renderToStaticMarkup(
      createElement(AskComposerSubmit, {
        loading: true,
        onCancel: () => {},
      }),
    );

    expect(html).toContain('aria-label="Cancel"');
    expect(html).toContain('type="button"');
    expect(html).toContain(">Stop<");
  });
});
