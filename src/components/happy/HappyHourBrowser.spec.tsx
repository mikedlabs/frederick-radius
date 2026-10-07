import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HappyHourBrowser, { type HHRow } from "./HappyHourBrowser";

function row(overrides: Partial<HHRow> = {}): HHRow {
  return {
    slug: "late-pour",
    name: "Late Pour",
    town: "Frederick",
    deal: "$5 house cocktails",
    verified: "verified Oct 2026",
    schedule: "Tuesday 4 PM-7 PM",
    windows: [{ days: [2], start: 16 * 60, end: 19 * 60 }],
    ...overrides,
  };
}

describe("HappyHourBrowser row picture", () => {
  it("asks for the 52px photo through the proxy's failure signal", () => {
    const html = renderToStaticMarkup(
      <HappyHourBrowser
        rows={[row({ photo: "/api/place-photo?name=places%2Flate&w=800" })]}
        today={2}
        nowMin={17 * 60}
      />,
    );

    expect(html).toContain(
      'src="/api/place-photo?name=places%2Flate&amp;w=104&amp;fallback=signal"',
    );
  });

  it("marks a photoless row flat instead of with gradient art", () => {
    const html = renderToStaticMarkup(
      <HappyHourBrowser rows={[row()]} today={2} nowMin={17 * 60} />,
    );

    expect(html).toContain('data-radius-photo="mark"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("linear-gradient(150deg");
  });
});
