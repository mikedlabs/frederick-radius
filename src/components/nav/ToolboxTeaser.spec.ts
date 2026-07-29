import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ToolboxTeaser from "./ToolboxTeaser";

describe("ToolboxTeaser", () => {
  it("keeps Today to one practical action and one All tools door", () => {
    const html = renderToStaticMarkup(createElement(ToolboxTeaser));

    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain("Need something practical?");
    expect(html).toContain("Find the nearest essential");
    expect(html).toContain("Restroom, water, trash, dog bags, seating, or power");
    expect(html).toContain('href="/amenities"');
    expect(html).toContain("lucide-toilet");
    expect(html).not.toContain("Transit and trains");
    expect(html).toContain("All tools");
    expect(html).toContain('href="/compass"');
  });
});
