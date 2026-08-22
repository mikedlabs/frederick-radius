import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MotionDisclosure from "./MotionDisclosure";

function render(open: boolean): string {
  return renderToStaticMarkup(
    createElement(
      MotionDisclosure,
      {
        id: "test-disclosure",
        open,
        className: "outer-class",
        innerClassName: "inner-class",
      },
      createElement("a", { href: "/map" }, "Open the map"),
    ),
  );
}

describe("MotionDisclosure", () => {
  it("keeps progressive content mounted and non-interactive while closed", () => {
    const html = render(false);

    expect(html).toContain('id="test-disclosure"');
    expect(html).toContain("data-motion-disclosure");
    expect(html).toContain('data-state="closed"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
    expect(html).toContain('href="/map"');
    expect(html).toContain("Open the map");
    expect(html).toContain("motion-disclosure__inner inner-class");
  });

  it("restores the content to the accessibility and keyboard journey when open", () => {
    const html = render(true);

    expect(html).toContain('data-state="open"');
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("inert");
    expect(html).toContain("outer-class");
    expect(html).toContain('href="/map"');
  });
});
