import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayListLink, { TodayListArrow } from "./TodayListLink";

describe("TodayListLink", () => {
  it("marks a trailing arrow as the list-page door", () => {
    const html = renderToStaticMarkup(
      createElement(TodayListLink, { href: "/events" }, "All events"),
    );
    expect(html).toContain('href="/events"');
    expect(html).toContain('data-today-list-link=""');
    expect(html).toContain("today-list-link__icon");
    expect(html).toContain("All events");
  });

  it("keeps the same arrow mark when used without a wrapping link", () => {
    const html = renderToStaticMarkup(createElement(TodayListArrow));
    expect(html).toContain("today-list-link__icon");
  });
});
