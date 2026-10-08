import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HHRow } from "./HappyHourBrowser";
import HappyHourGuide, { coverDeal } from "./HappyHourGuide";
import DealLines from "./DealLines";

const WEDNESDAY = 3;

function row(overrides: Partial<HHRow> = {}): HHRow {
  return {
    slug: "madrones",
    name: "Madrones",
    town: "Frederick City",
    category: "restaurant",
    deal: "Daily $7 house spirits and $1 off other drinks; day-specific deals vary.",
    verified: "verified Oct 2026",
    schedule: "Mon-Fri 3:00-6:00 PM",
    windows: [{ days: [1, 2, 3, 4, 5], start: 15 * 60, end: 18 * 60 }],
    ...overrides,
  };
}

function cover(html: string): string {
  const start = html.indexOf("data-happy-cover");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</a>", start));
}

describe("coverDeal", () => {
  it("leads with the clause that carries dealHook's figure", () => {
    expect(coverDeal("Daily $7 house spirits and $1 off other drinks; day-specific deals vary.")).toEqual({
      lead: "$1 off other drinks",
      rest: ["Daily $7 house spirits", "Day-specific deals vary"],
    });
    expect(coverDeal("$5 house spirits")).toEqual({ lead: "$5 house spirits", rest: [] });
  });

  it("does not mistake a longer figure for the hook", () => {
    // The hook is $2 off; "$12" must not be read as "$2".
    expect(coverDeal("$12 pitchers, $2 off drafts").lead).toBe("$2 off drafts");
  });

  it("finds a half-price clause for a 50% hook", () => {
    expect(coverDeal("Half-price wings, $6 cocktails").lead).toBe("Half-price wings");
  });

  it("has no lead for a deal with no figure", () => {
    expect(coverDeal("Food and drink specials").lead).toBeNull();
  });
});

describe("HappyHourGuide cover", () => {
  it("never draws a stand-in picture when the pour has no photo", () => {
    const html = renderToStaticMarkup(
      <HappyHourGuide rows={[row()]} today={WEDNESDAY} nowMin={16 * 60} />,
    );
    const lead = cover(html);

    expect(lead).not.toContain("<img");
    expect(lead).not.toContain("data-radius-photo");
    expect(lead).not.toContain("linear-gradient");
    expect(lead).not.toContain("#fff");
    expect(lead).toContain(">Madrones<");
    expect(lead).toContain("display-3");
    expect(lead).toContain(">$1 off other drinks<");
    expect(lead).toContain(">Frederick City<");
  });

  it("asks the photo proxy for its failure signal and sets no type over the photo", () => {
    const html = renderToStaticMarkup(
      <HappyHourGuide
        rows={[row({ photo: "/api/place-photo?name=places%2Fmadrones&w=1200" })]}
        today={WEDNESDAY}
        nowMin={16 * 60}
      />,
    );
    const lead = cover(html);

    expect(lead).toContain("fallback=signal");
    // The photo frame closes before the plate opens: nothing rides on it.
    const frame = lead.slice(lead.indexOf("data-radius-photo"), lead.indexOf("</span>", lead.indexOf("data-radius-photo")));
    expect(frame).not.toContain("Madrones");
    expect(frame).not.toContain("$1 off");
  });

  it("shows the Amber live line only while the parsed window is open", () => {
    const live = cover(
      renderToStaticMarkup(<HappyHourGuide rows={[row()]} today={WEDNESDAY} nowMin={16 * 60} />),
    );
    expect(live).toContain("var(--app-amber)");
    expect(live).toContain("On now until 6 PM");

    const later = cover(
      renderToStaticMarkup(<HappyHourGuide rows={[row()]} today={WEDNESDAY} nowMin={9 * 60} />),
    );
    expect(later).not.toContain("var(--app-amber)");
    expect(later).not.toContain("On now");
    expect(later).toContain("Mon-Fri 3:00-6:00 PM");
  });
});

describe("DealLines", () => {
  it("sets every figure in semibold Ink, never Plum", () => {
    const html = renderToStaticMarkup(<DealLines deal="$4 craft pints and 25% off crab legs" />);
    expect(html).toContain('class="font-semibold tabular-nums" style="color:var(--app-ink)"');
    expect(html).not.toContain("--app-accent");
    expect(html).not.toContain("#fff");
  });
});
