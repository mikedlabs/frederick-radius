import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/app/globals.css"), "utf8");
const start = css.indexOf("/* ── Today registration + shelf motion");
const end = css.indexOf("\n.font-serif", start);
const todayMotionCss = css.slice(start, end);

describe("Today motion contracts", () => {
  it("keeps the registration reveal one-shot and layout-neutral", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(todayMotionCss).toContain("@starting-style");
    expect(todayMotionCss).toContain("transform: scaleX(0)");
    const animations = [...todayMotionCss.matchAll(/\banimation\s*:\s*([^;]+)/g)]
      .map((match) => match[1].trim());
    expect(animations).toEqual(["none"]);
    expect(todayMotionCss).not.toContain("infinite");
    expect(todayMotionCss).not.toContain("linear-gradient(");
  });

  it("has an explicit reduced-motion landing state", () => {
    expect(todayMotionCss).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
    expect(todayMotionCss).toContain("transition: none");
    expect(todayMotionCss).toContain(
      ".today-section-heading .live-dot::before",
    );
  });

  it("scopes mobile snap and focus treatment to the Today reading surface", () => {
    expect(todayMotionCss).toContain(
      ".app-main-reading:has([data-today-section-heading]) .shelf-rail",
    );
    expect(todayMotionCss).toContain("scroll-snap-type: x proximity");
    expect(todayMotionCss).toContain("padding-inline-end: 1rem");
    expect(todayMotionCss).toContain("scroll-padding-inline: 0.25rem 1rem");
    expect(todayMotionCss).toContain(":is(a, button):focus-visible");
    expect(todayMotionCss).not.toContain("section[aria-label=");
  });
});
