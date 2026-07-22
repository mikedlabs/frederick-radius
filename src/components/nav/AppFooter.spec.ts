import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppFooter from "./AppFooter";

describe("AppFooter", () => {
  it("keeps mobile site links in a native disclosure and the safety note visible", () => {
    const html = renderToStaticMarkup(createElement(AppFooter));

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("About and site links");
    expect(html).toContain("call 911 for emergencies");
    expect(html).not.toContain("helps people find open places");
  });

  it.each([
    "/about",
    "/trust",
    "/towns",
    "/places",
    "/events",
    "/contacts",
    "/privacy",
    "/terms",
  ])("keeps %s available in both responsive footer variants", (href) => {
    const html = renderToStaticMarkup(createElement(AppFooter));
    const occurrences = html.split(`href="${href}"`).length - 1;

    expect(occurrences).toBe(2);
  });
});
