import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { comingDay } from "@/lib/today/tomorrow";
import TomorrowPreview, { dayProgramLabel } from "./TomorrowPreview";

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

  it("draws the pin map between the forecast sentence and the rows it numbers", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview
        day={comingDay(LATE_TUESDAY)}
        weatherSentence="The forecast high is 64°, with mostly sunny skies."
        rowCount={2}
        map={<div data-test-map="" />}
      >
        <li>Game Night</li>
        <li>Bluegrass Jam</li>
      </TomorrowPreview>,
    );
    const sentence = html.indexOf("The forecast high is 64°");
    const map = html.indexOf("data-test-map");
    expect(map).toBeGreaterThan(sentence);
    expect(map).toBeLessThan(html.indexOf("<ul>"));
  });

  it("never draws a map over an empty list", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview
        day={comingDay(LATE_TUESDAY)}
        weatherSentence="The forecast high is 64°, with mostly sunny skies."
        rowCount={0}
        map={<div data-test-map="" />}
      />,
    );
    expect(html).not.toContain("data-test-map");
  });

  it("writes its copy on the named type scale", () => {
    const html = renderToStaticMarkup(
      <TomorrowPreview
        day={comingDay(LATE_TUESDAY)}
        weatherSentence="The forecast high is 64°, with mostly sunny skies."
        rowCount={0}
      />,
    );
    const paragraphs = html.match(/<p class="[^"]*"/g) ?? [];
    expect(paragraphs).toHaveLength(2);
    for (const paragraph of paragraphs) {
      expect(paragraph).toContain("text-meta-lg");
      expect(paragraph).not.toMatch(/text-\[\d/);
    }
  });
});

describe("dayProgramLabel", () => {
  // Wednesday Oct 7, 2026, Eastern (UTC-4).
  const at = (hour: number, minute = 0) =>
    new Date(Date.UTC(2026, 9, 7, hour + 4, minute));

  it("names the day's events until the evening daypart begins", () => {
    expect(dayProgramLabel(at(5))).toBe("Today's events");
    expect(dayProgramLabel(at(12))).toBe("Today's events");
    expect(dayProgramLabel(at(15, 59))).toBe("Today's events");
  });

  it("says Tonight on the same 4 PM boundary as the masthead and program groups", () => {
    expect(dayProgramLabel(at(16))).toBe("Tonight");
    expect(dayProgramLabel(at(17))).toBe("Tonight");
    expect(dayProgramLabel(at(20, 59))).toBe("Tonight");
  });

  it("covers tonight and the coming day after 9 PM", () => {
    expect(dayProgramLabel(at(21))).toBe("Tonight and tomorrow");
    expect(dayProgramLabel(at(23, 30))).toBe("Tonight and tomorrow");
    expect(dayProgramLabel(ONE_AM_WEDNESDAY)).toBe("Overnight and today");
  });
});
