import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MovieShowtimeChoices } from "./WantAnswerPanel";

describe("MovieShowtimeChoices", () => {
  it("keeps both cinema choices inline with direct official showtime actions", () => {
    const html = renderToStaticMarkup(
      createElement(MovieShowtimeChoices, {
        accent: "var(--app-accent)",
        onOpen: vi.fn(),
        rows: [
          {
            slug: "warehouse-cinemas-frederick-frederick",
            name: "Warehouse Cinemas Frederick",
            fact: "Choose a film and showtime.",
            distance: "2.1 mi",
            photo: null,
            where: "Frederick",
            detail: null,
            tip: null,
            deal: null,
            action: {
              label: "Showtimes & tickets",
              href: "https://frederick.warehousecinemas.com/tickets-showtimes/",
            },
          },
          {
            slug: "regal-westview-frederick",
            name: "Regal Westview",
            fact: "Choose a film and showtime.",
            distance: "3.4 mi",
            photo: null,
            where: "Frederick",
            detail: null,
            tip: null,
            deal: null,
            action: {
              label: "Showtimes & tickets",
              href: "https://www.regmovies.com/theatres/regal-westview-1910",
            },
          },
        ],
      }),
    );

    expect(html).toContain("Warehouse Cinemas Frederick");
    expect(html).toContain("Regal Westview");
    expect(html).toContain(
      'href="https://frederick.warehousecinemas.com/tickets-showtimes/"',
    );
    expect(html).toContain(
      'href="https://www.regmovies.com/theatres/regal-westview-1910"',
    );
    expect(html.match(/>Showtimes &amp; tickets</g)).toHaveLength(2);
    expect(html).toContain('target="_blank"');
    expect(html).toContain(
      'aria-label="Showtimes &amp; tickets for Warehouse Cinemas Frederick (opens in a new tab)"',
    );
    expect(html).not.toContain("confirmed open");
  });

  it("paints a cinema photo through the failure signal and marks the rest", () => {
    const row = {
      slug: "warehouse-cinemas-frederick-frederick",
      name: "Warehouse Cinemas Frederick",
      fact: "Choose a film and showtime.",
      distance: null,
      where: "Frederick",
      detail: null,
      tip: null,
      deal: null,
    };
    const html = renderToStaticMarkup(
      createElement(MovieShowtimeChoices, {
        accent: "var(--app-accent)",
        onOpen: vi.fn(),
        rows: [
          { ...row, photo: "/api/place-photo?name=places%2Fwarehouse&w=800" },
          { ...row, slug: "regal-westview-frederick", name: "Regal Westview", photo: null },
        ],
      }),
    );

    // A raw <img> painted the proxy's fallback plate as if it were a photo.
    expect(html).toContain(
      'src="/api/place-photo?name=places%2Fwarehouse&amp;w=96&amp;fallback=signal"',
    );
    expect(html.match(/data-radius-photo="mark"/g)).toHaveLength(1);
    // No initial-letter plate standing in for a logo the cinema does not have.
    expect(html).not.toMatch(/>R<\/span>/);
  });
});
