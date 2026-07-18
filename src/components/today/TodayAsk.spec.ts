import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk from "./TodayAsk";

describe("Today Ask Radius launcher", () => {
  it("hands a named question to the dedicated Ask workspace", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk));

    expect(html).toContain('action="/ask"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).not.toContain("/api/ask");
  });
});
