import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BRUNSWICK_CANCELLATION, COUNTY_TRANSIT_BULLETIN_URL, MARC_HOLIDAY_URL, countyTransitException,
} from "@/lib/transit-service-calendar";
import TransitHolidayNotice from "./TransitHolidayNotice";

const htmlOn = (day: string) => renderToStaticMarkup(<TransitHolidayNotice now={new Date(day)} />);

describe("Holiday operator comparison", () => {
  it("shows dated decisions with the underlying county and MARC bulletins", () => {
    const html = htmlOn("2026-11-27T22:00:00Z");
    expect(html).toContain("County Transit");
    expect(html).toContain("MARC Brunswick");
    expect(html).toContain(BRUNSWICK_CANCELLATION);
    expect(html).toContain(COUNTY_TRANSIT_BULLETIN_URL);
    expect(html).toContain(MARC_HOLIDAY_URL);
    expect(html).toContain(countyTransitException("2026-11-28")!.text);
    expect(html).toContain("Check MARC schedule");
  });

  it("removes Friday's closure at midnight Eastern while keeping the Saturday service detail", () => {
    expect(htmlOn("2026-11-28T04:59:59Z")).toContain(BRUNSWICK_CANCELLATION);
    const html = htmlOn("2026-11-28T05:00:00Z");
    expect(html).not.toContain("MARC");
    expect(html).not.toContain("cancelled");
    expect(html).toContain("Regular Saturday schedules");
    expect(html).toContain(COUNTY_TRANSIT_BULLETIN_URL);
    expect(htmlOn("2026-11-29T05:00:00Z")).toBe("");
  });
});
