import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnimatedSkyGlyph from "./AnimatedSkyGlyph";

describe("AnimatedSkyGlyph", () => {
  it("uses the warm daylight color for a sunny forecast", () => {
    const html = renderToStaticMarkup(createElement(AnimatedSkyGlyph, {
      variant: "Sun",
    }));

    expect(html).toContain("var(--sky-sun-color)");
    expect(html).not.toContain("var(--app-accent)");
  });
});
