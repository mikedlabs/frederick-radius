import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AerialBeat, { PLACE_AERIAL_MAX_METERS, aerialCaptureMonth, aerialFrameFor } from "./AerialBeat";

// "FALL COLORS" in the owner's aerial manifest: downtown Frederick, taken
// 2024-10-29T22:21Z (6:21 PM Eastern).
const FALL_COLORS = { lng: -77.410188, lat: 39.416312 };
// Ricci Italian Restaurant, filed under Walkersville. Before this change a
// drone frame 718 m away, taken inside Frederick, was captioned
// "Walkersville from the air" on its page.
const RICCI_WALKERSVILLE = { lng: -77.3864061, lat: 39.4549715 };
const OCTOBER = new Date("2026-10-07T16:00:00Z");

describe("aerialCaptureMonth", () => {
  it("dates the frame by its Eastern capture month", () => {
    expect(aerialCaptureMonth("2024-10-29T22:21:25.000Z")).toBe("October 2024");
    // 10 PM on Halloween in Frederick is still October, though UTC says November.
    expect(aerialCaptureMonth("2024-11-01T02:00:00.000Z")).toBe("October 2024");
  });

  it("says nothing without a usable capture time", () => {
    expect(aerialCaptureMonth(null)).toBeNull();
    expect(aerialCaptureMonth("not a date")).toBeNull();
  });
});

describe("aerialFrameFor", () => {
  it("names the area from the frame's own geotag", () => {
    const frame = aerialFrameFor(FALL_COLORS, { municipality: "frederick", now: OCTOBER });
    expect(frame?.area).toBe("Frederick City");
    expect(frame?.captured).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(frame?.aerial.distance_m).toBeLessThanOrEqual(PLACE_AERIAL_MAX_METERS);
  });

  it("never lends a Frederick frame to another town's page", () => {
    expect(aerialFrameFor(FALL_COLORS, { municipality: "walkersville", now: OCTOBER })).toBeNull();
    // Even with the old 800 m reach, the frame was taken inside Frederick.
    expect(
      aerialFrameFor(RICCI_WALKERSVILLE, { municipality: "walkersville", maxMeters: 800, now: OCTOBER }),
    ).toBeNull();
  });

  it("keeps place pages to frames taken within about 150 m", () => {
    // Costco on the south side sits 379 m from the nearest frame.
    expect(
      aerialFrameFor({ lng: -77.4076181, lat: 39.4016896 }, { municipality: "frederick", now: OCTOBER }),
    ).toBeNull();
  });
});

describe("AerialBeat", () => {
  it("names the frame with its own area and capture month, and holds the caption until it decodes", () => {
    const html = renderToStaticMarkup(
      <AerialBeat lat={FALL_COLORS.lat} lng={FALL_COLORS.lng} municipality="frederick" />,
    );
    expect(html).toMatch(
      /alt="Frederick City seen from above in (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}"/,
    );
    expect(html).not.toContain("Walkersville");
    // The scrim and caption wait for a decoded image (AerialBeat.browser.spec).
    expect(html).not.toContain("from the air");
    expect(html).not.toContain("<figcaption");
  });

  it("renders nothing for a page in another municipality", () => {
    expect(
      renderToStaticMarkup(
        <AerialBeat lat={RICCI_WALKERSVILLE.lat} lng={RICCI_WALKERSVILLE.lng} municipality="walkersville" />,
      ),
    ).toBe("");
  });
});
