import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayAsk from "./TodayAsk";

describe("Today Ask Radius launcher", () => {
  it("hands a named question to the dedicated Ask workspace", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk));

    expect(html).toContain('action="/ask"');
    expect(html).toContain('name="q"');
    expect(html).toContain("data-ask-composer");
    expect(html).toContain("data-ask-composer-mark");
    expect(html).not.toContain("/api/ask");
  });

  it("can sit flush inside the shared Today decision surface", () => {
    const html = renderToStaticMarkup(createElement(TodayAsk, { embedded: true }));

    expect(html).toContain('data-surface-row="ask"');
    expect(html).not.toContain('class="mt-3 scroll-mt-24"');
    expect(html).toContain("border-b py-2");
  });
});
