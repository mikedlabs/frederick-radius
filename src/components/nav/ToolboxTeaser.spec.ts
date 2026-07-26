import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ToolboxTeaser from "./ToolboxTeaser";

describe("ToolboxTeaser", () => {
  it("keeps Today to four practical shortcuts and one All tools door", () => {
    const html = renderToStaticMarkup(createElement(ToolboxTeaser));

    expect(html.match(/<a /g)).toHaveLength(5);
    expect(html).toContain("Nearby essentials");
    expect(html).toContain('href="/amenities"');
    expect(html).toContain("Parking");
    expect(html).toContain("Transit and trains");
    expect(html).toContain("Live conditions");
    expect(html).toContain("All tools");
    expect(html).toContain('href="/compass"');
  });
});
