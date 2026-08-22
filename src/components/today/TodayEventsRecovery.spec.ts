import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayEventsRecoveryView } from "./TodayEventsRecovery";

describe("TodayEventsRecoveryView", () => {
  it("restores a current live event when the server snapshot missed", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: {
          partial: false,
          events: [
            {
              slug: "black-frederick-festival-2026-08-22",
              title: "Black Frederick Festival",
              venue: "Carroll Creek Outdoor Amphitheater",
              municipality: "frederick",
              time: "12:00 PM",
              moment: "Now",
              image: null,
              free: false,
              when: "Sat, Aug 22 · 12:00 PM–6:00 PM",
              description:
                "A community celebration with performances, food, vendors, and activities for all ages.",
              address: "50 Carroll Creek Way, Frederick, MD 21701",
              admission: "Not listed by the event source",
              sourceLabel: "Downtown Frederick Partnership",
              sourceUrl:
                "https://downtownfrederick.org/vm-event/black-frederick-festival/",
              highlight: true,
            },
          ],
        },
      }),
    );

    expect(html).toContain("Black Frederick Festival");
    expect(html).toContain(
      'href="/events/black-frederick-festival-2026-08-22"',
    );
    expect(html).toContain("Not listed by the event source");
    expect(html).toContain("On Carroll Creek now");
    expect(html).toContain("Sat, Aug 22 · 12:00 PM–6:00 PM");
    expect(html).toContain("50 Carroll Creek Way");
    expect(html).toContain("Full event details");
    expect(html).toContain("Source · Downtown Frederick Partnership");
    expect(html).toContain("Official event page");
    expect(html).toContain('data-today-event-highlight="carroll-creek"');
    expect(html).toContain('data-today-event-recovery="true"');
  });

  it("states that it is checking instead of claiming there are no events", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, { response: null }),
    );

    expect(html).toContain("Radius is checking the current event board.");
    expect(html).not.toContain("No events");
    expect(html).toContain('href="/events"');
  });

  it("names a failed recovery instead of looking stuck", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: null,
        failed: true,
      }),
    );

    expect(html).toContain("Current event listings could not load here.");
    expect(html).not.toContain("Radius is checking the current event board.");
  });

  it("distinguishes a healthy empty result from a failed archive read", () => {
    const html = renderToStaticMarkup(
      createElement(TodayEventsRecoveryView, {
        response: { events: [], partial: false },
      }),
    );

    expect(html).toContain("No current listings");
    expect(html).toContain("No current event listings met Radius&#x27;s Today checks.");
    expect(html).not.toContain("Current listings unavailable");
  });
});
