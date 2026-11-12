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

  it.each(["Moon", "CloudMoon"] as const)("draws the %s crescent in a theme-readable color", (variant) => {
    const html = renderToStaticMarkup(createElement(AnimatedSkyGlyph, { variant }));

    // A hard-coded cream moon nearly vanished on the white light ground.
    expect(html).toContain("var(--sky-moon-color, var(--app-ink-3))");
    expect(html).not.toMatch(/#E9E3D2/i);
  });

  it("keeps the cream moon on a night-sky ground in either appearance", () => {
    const html = renderToStaticMarkup(createElement(AnimatedSkyGlyph, { variant: "Moon", onDarkSky: true }));

    // The Pulse weather header draws the glyph on navy even in light
    // appearance, where the appearance-following tone would not read.
    expect(html).toMatch(/--sky-moon-color:\s*#E9E3D2/i);
  });
});
