import { describe, expect, it } from "vitest";
import { momentBySlug } from "@/data/civic-moments";
import {
  licenseUrlFor,
  momentDateLine,
  momentDayParts,
  momentDays,
  nextMomentDay,
  momentHeroImage,
  momentPhotoCreditText,
  sourceHost,
  sourcedMomentFacts,
} from "./momentGuide";

describe("momentHeroImage", () => {
  it("prefers an owned photograph of the occasion", () => {
    const image = momentHeroImage(momentBySlug("in-the-street-2026")!);
    // Owner photos carry no display credit (owner call in #1776).
    expect(image).toMatchObject({
      kind: "owned",
      src: "/images/moments/in-the-streets-2024-mike-d.jpg",
      credit: "",
    });
  });

  it("falls back to the licensed town photograph with a full credit", () => {
    const image = momentHeroImage(momentBySlug("catoctin-colorfest-2026")!);
    expect(image.kind).toBe("licensed");
    if (image.kind !== "licensed") return;
    expect(image.src).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Thurmont%20Town%20Square%20Park.jpg?width=1600",
    );
    expect(image.credit).toEqual({
      depicts: "Thurmont Town Square Park, the town center",
      author: "CraigShipp.com Photos",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Thurmont_Town_Square_Park.jpg",
    });
    expect(momentPhotoCreditText(image.credit)).toBe(
      "Thurmont Town Square Park, the town center. Photo: CraigShipp.com Photos, CC BY-SA 2.0",
    );
  });

  it("shows no picture for an unknown town or a moment without one", () => {
    expect(
      momentHeroImage({ heroPhoto: { townSlug: "nowhere", depicts: "Somewhere" } }),
    ).toEqual({ kind: "none" });
    expect(
      momentHeroImage({ heroPhoto: { townSlug: "thurmont", depicts: "  " } }),
    ).toEqual({ kind: "none" });
    expect(momentHeroImage(momentBySlug("fourth-of-july-2026")!)).toEqual({ kind: "none" });
  });

  it("sizes the Commons request for the frame that paints it", () => {
    const thumb = momentHeroImage(momentBySlug("catoctin-colorfest-2026")!, 320);
    expect(thumb.kind === "licensed" && thumb.src.endsWith("?width=320")).toBe(true);
  });
});

describe("licenseUrlFor", () => {
  it("links known Commons licenses and leaves unknown labels unlinked", () => {
    expect(licenseUrlFor("CC BY-SA 4.0")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(licenseUrlFor("CC BY 2.0")).toBe("https://creativecommons.org/licenses/by/2.0/");
    expect(licenseUrlFor("All rights reserved")).toBeNull();
  });
});

describe("moment days", () => {
  it("prints a date plate's pieces without a time zone shift", () => {
    expect(momentDayParts("2026-10-10")).toEqual({
      date: "2026-10-10",
      month: "Oct",
      day: "10",
      weekday: "Sat",
      label: "Saturday, October 10, 2026",
    });
    expect(momentDayParts("2026-02-31")).toBeNull();
    expect(momentDayParts("Oct 10")).toBeNull();
  });

  it("sorts, dedupes and drops invalid days", () => {
    expect(
      momentDays([{ date: "2026-10-11" }, { date: "bad" }, { date: "2026-10-10" }, { date: "2026-10-11" }]).map(
        (d) => d.date,
      ),
    ).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("shows the next remaining day, so Sunday's card never leads with Saturday", () => {
    const days = momentDays([{ date: "2026-10-10" }, { date: "2026-10-11" }]);
    expect(nextMomentDay(days)?.date).toBe("2026-10-10");
    expect(nextMomentDay(days, "2026-10-09")?.date).toBe("2026-10-10");
    expect(nextMomentDay(days, "2026-10-10")?.date).toBe("2026-10-10");
    expect(nextMomentDay(days, "2026-10-11")?.date).toBe("2026-10-11");
    expect(nextMomentDay(days, "2026-10-12")?.date).toBe("2026-10-11");
    expect(nextMomentDay([], "2026-10-10")).toBeUndefined();
  });

  it("reads consecutive days as a range and separate days as a list", () => {
    expect(momentDateLine([{ date: "2026-10-10" }, { date: "2026-10-11" }])).toEqual({
      text: "OCT 10-11 · 2026",
      label: "Saturday, October 10, 2026 and Sunday, October 11, 2026",
    });
    expect(momentDateLine([{ date: "2026-09-30" }, { date: "2026-10-01" }])?.text).toBe(
      "SEP 30-OCT 1 · 2026",
    );
    expect(momentDateLine([{ date: "2026-10-10" }, { date: "2026-10-17" }])?.text).toBe(
      "OCT 10, 17 · 2026",
    );
    expect(momentDateLine([{ date: "2026-10-10" }])?.text).toBe("OCT 10 · 2026");
    expect(momentDateLine(undefined)).toBeNull();
    expect(momentDateLine([])).toBeNull();
  });
});

describe("sourcedMomentFacts", () => {
  it("keeps only facts that name an http source", () => {
    const facts = sourcedMomentFacts([
      { label: "Dates", value: "Sat Oct 10 and Sun Oct 11", source_url: "https://www.thurmont.com/2236/Colorfest" },
      { label: "Parking", value: "$10" },
      { label: "Shuttle", value: "Free", source_url: "ftp://example.org" },
      { label: " ", value: "Blank label", source_url: "https://example.org" },
    ]);
    expect(facts.map((f) => f.label)).toEqual(["Dates"]);
  });

  it("names a source by its host", () => {
    expect(sourceHost("https://www.thurmont.com/2236/Colorfest")).toBe("thurmont.com");
    expect(sourceHost("https://colorfest.org/plan-your-visit/")).toBe("colorfest.org");
  });
});
