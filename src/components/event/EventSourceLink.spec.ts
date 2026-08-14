import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EventSourceLink from "./EventSourceLink";

describe("EventSourceLink", () => {
  it("keeps the official source visible as a quiet, safe external link", () => {
    const html = renderToStaticMarkup(
      createElement(EventSourceLink, {
        href: "https://publisher.example/events/snallyfest",
      }),
    );

    expect(html).toContain('data-event-source-link="true"');
    expect(html).toContain(
      'href="https://publisher.example/events/snallyfest"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Official event page");
    expect(html).toContain("tap-44-y");
  });
});
