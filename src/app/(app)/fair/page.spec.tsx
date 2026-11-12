import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import config from "../../../../next.config";
import FairPage, { metadata } from "./page";

/** Built from its code point so this file never carries the character. */
const EM_DASH = String.fromCharCode(0x2014);

/** Collapse markup to the text a visitor reads. */
function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("/fair after the 2026 fair", () => {
  it("says plainly that the fair has ended and when it ran", () => {
    const markup = renderToStaticMarkup(<FairPage />);
    const text = visibleText(markup);

    expect(markup).toMatch(
      /<h1[^>]*>The 2026 Great Frederick Fair has ended\.<\/h1>/,
    );
    expect(text).toContain("The fair ran from September 18 to 26, 2026.");
    expect(text).toContain(
      "The Frederick Radius guide to the fair closed when the fair did.",
    );
    expect(text).toContain(
      "Events across Frederick County are listed on the Events page.",
    );
  });

  it("offers one action, and it goes to Events", () => {
    const markup = renderToStaticMarkup(<FairPage />);
    const links = [...markup.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(links).toEqual(["/events"]);
    expect(visibleText(markup)).toContain("See events");
  });

  it("makes no promise about a future fair and uses no em dashes", () => {
    const text = visibleText(renderToStaticMarkup(<FairPage />));

    expect(text).not.toMatch(/next year|2027|returns|see you|coming back/i);
    expect(text).not.toContain(EM_DASH);
  });

  it("describes itself honestly to search and link previews", () => {
    expect(metadata.title).toBe("The 2026 Great Frederick Fair has ended");
    expect(metadata.description).toContain("September 18 to 26, 2026");
    expect(metadata.description).not.toContain(EM_DASH);
    expect(metadata.alternates?.canonical).toBe("/fair");
  });
});

describe("retired fair addresses", () => {
  it("permanently redirect to /fair", async () => {
    const redirects = (await config.redirects?.()) ?? [];
    const toFair = redirects
      .filter((rule) => rule.destination === "/fair")
      .map((rule) => ({ source: rule.source, permanent: rule.permanent }));

    expect(toFair).toEqual([
      { source: "/moments/great-frederick-fair-2026/:path*", permanent: true },
      { source: "/fair-photo-viewer", permanent: true },
      { source: "/fair/:path+", permanent: true },
    ]);
  });

  it("never redirects /fair itself", async () => {
    const redirects = (await config.redirects?.()) ?? [];

    expect(
      redirects.some(
        (rule) => rule.source === "/fair" && !("has" in rule && rule.has),
      ),
    ).toBe(false);
  });
});
