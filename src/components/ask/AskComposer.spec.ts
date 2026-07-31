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
