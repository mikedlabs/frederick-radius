import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { comingDay } from "@/lib/today/tomorrow";
import TomorrowPreview from "./TomorrowPreview";

// 10:53 PM Tuesday Oct 6 and 1 AM Wednesday Oct 7, Eastern.
const LATE_TUESDAY = new Date("2026-10-07T02:53:00.000Z");
const ONE_AM_WEDNESDAY = new Date("2026-10-07T05:00:00.000Z");

describe("TomorrowPreview", () => {
  it("frames the coming day's rows under its own heading with the NWS sentence", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview
        day={comingDay(LATE_TUESDAY)}
        weatherSentence="The forecast high is 64°, with mostly sunny skies."
        rowCount={2}
      >
        <li>Game Night</li>
        <li>Bluegrass Jam</li>
      </TomorrowPreview>,
    );

    expect(html).toContain('aria-label="Tomorrow, Wednesday"');
    expect(html).toContain(">Tomorrow, Wednesday</h2>");
    expect(html.indexOf("The forecast high is 64°")).toBeGreaterThan(
      html.indexOf("Tomorrow, Wednesday</h2>"),
    );
    expect(html).toContain("<ul><li>Game Night</li><li>Bluegrass Jam</li></ul>");
    expect(html).toContain('href="/events"');
    // It is the night's answer now, not content inside "Plan the rest".
    expect(html).not.toContain("data-today-plan-rest-content");
  });

  it("calls the coming day later today after midnight", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview day={comingDay(ONE_AM_WEDNESDAY)} weatherSentence={null} rowCount={1}>
        <li>Wednesday Jam</li>
      </TomorrowPreview>,
    );
    expect(html).toContain(">Later today, Wednesday</h2>");
    expect(html).toContain('data-today-coming-day="later-today"');
  });

  it("points to the full listings with one link when no row can be confirmed", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview
        day={comingDay(LATE_TUESDAY)}
        weatherSentence="The forecast high is 64°, with mostly sunny skies."
        rowCount={0}
      />,
    );
    expect(html).toContain("Wednesday’s listings are on the");
    expect(html.match(/href="\/events"/g)).toHaveLength(1);
    expect(html).not.toContain("<ul>");
  });

  it("shows nothing when there is neither a row nor a forecast", () => {
    expect(
      renderToStaticMarkup(
        <TomorrowPreview day={comingDay(LATE_TUESDAY)} weatherSentence={null} rowCount={0} />,
      ),
    ).toBe("");
  });
});
