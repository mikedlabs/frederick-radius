import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodaySectionHeading from "./TodaySectionHeading";

describe("TodaySectionHeading", () => {
  it("keeps title, status, and the section door in one consistent header", () => {
    const html = renderToStaticMarkup(
      createElement(TodaySectionHeading, {
        title: "Events today",
        meta: "6 events today · 3 tonight",
        href: "/events",
      }),
    );

    expect(html).toContain("<h2");
    expect(html).toContain("Events today");
    expect(html).toContain("6 events today · 3 tonight");
    expect(html).toContain('href="/events"');
    expect(html).toContain('aria-label="See all: Events today"');
    expect(html).toContain("var(--app-border)");
    expect(html).toContain('data-today-section-heading="true"');
    expect(html).toContain("today-section-heading__copy");
    expect(html).toContain("today-section-heading__cta");
    expect(html).toContain("today-section-heading__registration");
    expect(html).toContain("today-section-heading__registration-accent");
    expect(html).toContain("today-section-heading__registration-rule");
  });

  it("shows a nonverbal live signal without changing the accessible title", () => {
    const html = renderToStaticMarkup(
      createElement(TodaySectionHeading, {
        title: "Available now",
        live: true,
      }),
    );

    expect(html).toContain("live-dot");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("gradient");
  });

  it("keeps the plate number inside the nonverbal registration line", () => {
    const html = renderToStaticMarkup(
      createElement(TodaySectionHeading, {
        title: "What’s on",
        plateNo: "No. 03",
      }),
    );

    expect(html).toContain("today-section-heading__plate");
    expect(html).toContain("No. 03");
    expect(html).toMatch(
      /today-section-heading__registration[^>]*aria-hidden="true"[\s\S]*No\. 03/,
    );
  });
});
