import { describe, expect, it } from "vitest";
import { CIVIC_MOMENTS } from "@/data/civic-moments";
import { eventArrival } from "./eventArrival";
import { momentSectionId } from "./momentSectionId";

describe("eventArrival", () => {
  it("sends Colorfest to the guide's parking and shuttle section with its sourced caveat", () => {
    const arrival = eventArrival("catoctin-colorfest-thurmont-2026");

    expect(arrival?.href).toBe("/moments/catoctin-colorfest-2026#getting-there");
    expect(arrival?.note?.sourceUrl).toMatch(/^https:\/\/colorfest\.org\//);
    expect(arrival?.note?.text.length).toBeGreaterThan(0);
  });

  it("is null for an ordinary event", () => {
    expect(eventArrival("not-a-moment-event")).toBeNull();
  });

  it("points every arrival link at a section the guide actually renders", () => {
    for (const moment of CIVIC_MOMENTS) {
      for (const slug of moment.eventSlugs ?? []) {
        const arrival = eventArrival(slug);
        if (!arrival) continue;
        const anchor = arrival.href.split("#")[1];
        expect(moment.sections.map((s) => momentSectionId(s.heading))).toContain(anchor);
      }
    }
  });
});
