// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BusinessExtrasCard from "./BusinessExtrasCard";

describe("BusinessExtrasCard", () => {
  it("groups every definition term and description as direct siblings", () => {
    document.body.innerHTML = renderToStaticMarkup(
      createElement(BusinessExtrasCard, {
        info: {
          known_for: "House-roasted coffee",
          happy_hour: "Weekdays from 4 to 6 PM",
          specials: ["Tuesday tasting flight"],
          notable: "Patio seating",
          source: {
            url: "https://example.com/visit",
            fetchedAt: "2026-08-09T12:00:00.000Z",
          },
        },
      }),
    );

    const list = document.querySelector("dl");
    expect(list).not.toBeNull();

    const groups = Array.from(list?.children ?? []);
    expect(groups).toHaveLength(4);
    for (const group of groups) {
      expect(group.tagName).toBe("DIV");
      expect(Array.from(group.children, (child) => child.tagName)).toEqual([
        "DT",
        "DD",
      ]);
    }
  });
});
