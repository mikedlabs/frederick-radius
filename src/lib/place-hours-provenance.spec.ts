import { describe, expect, it } from "vitest";
import type { OfficialHoursEvidence } from "@/data/places";
import { placeHoursProvenance } from "./place-hours-provenance";

const now = Date.parse("2026-10-20T20:00:00Z");
const evidence: OfficialHoursEvidence = {
  slug: "thai-meric-eatery-bar-frederick",
  kind: "merchant",
  source_name: "Thai Meric Eatery & Bar",
  source_url: "https://www.thaimeric.com/",
  observed_at: "2026-10-20T11:42:21.627Z",
  expires_at: "2026-10-27T11:42:21.627Z",
  coverage_from: "2026-10-20",
  coverage_through: "2026-10-27",
  exceptions: [],
};
const merchant = { hours: { _official: evidence }, hours_source: "first_party" as const };

describe("place hours provenance", () => {
  it("names the merchant's own source and exact Eastern observation", () => {
    expect(placeHoursProvenance(merchant, now)).toBe("Hours from Thai Meric Eatery & Bar, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it("uses the official observation rather than newer generic listing metadata", () => {
    expect(placeHoursProvenance({ ...merchant, hours_updated_at: "2026-10-20T19:59:00Z" }, now))
      .toBe("Hours from Thai Meric Eatery & Bar, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it("retains the publisher of a known library's exact source and closure URLs", () => {
    const library = { hours: { _official: { ...evidence, kind: undefined, source_name: undefined, slug: "c-burr-artz-public-library-frederick", source_url: "https://www.fcpl.org/branches-hours/c-burr-artz-public-library", closures_url: "https://www.fcpl.org/holiday-closings" } }, hours_source: "first_party" as const };
    expect(placeHoursProvenance(library, now)).toBe("Hours from Frederick County Public Libraries, observed Oct 20, 2026 at 7:42 AM ET.");
    expect(placeHoursProvenance({ ...library, hours: { _official: { ...library.hours._official, source_name: "Frederick County Public Libraries" } } }, now))
      .toBe("Hours from Frederick County Public Libraries, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it.each([
    { source_url: "https://www.fcpl.org.evil.example/branches-hours/c-burr-artz-public-library" },
    { source_url: "https://www.fcpl.org/branches-hours/not-a-reviewed-branch" },
    { source_url: "https://www.fcpl.org/branches-hours/c-burr-artz-public-library?unrecognized=1" },
    { source_url: "http://www.fcpl.org/branches-hours/c-burr-artz-public-library" },
    { slug: "thai-meric-eatery-bar-frederick" },
    { closures_url: "https://www.fcpl.org.evil.example/holiday-closings" },
    { kind: "merchant" as const },
  ])("does not assign the library publisher to unrecognized evidence %j", patch => {
    const official = { ...evidence, kind: undefined, source_name: undefined, slug: "c-burr-artz-public-library-frederick", source_url: "https://www.fcpl.org/branches-hours/c-burr-artz-public-library", closures_url: "https://www.fcpl.org/holiday-closings", ...patch };
    expect(placeHoursProvenance({ hours: { _official: official }, hours_source: "first_party" }, now))
      .toBe("Hours from the official source, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it("uses a generic official source for an unnamed merchant despite older provider metadata", () => {
    expect(placeHoursProvenance({ hours: { _official: { ...evidence, source_name: " " } }, hours_source: "google_places" }, now))
      .toBe("Hours from the official source, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it.each([undefined, "", "not-a-date", "2026-10-20", "2026-10-20T11:42:21", "2026-02-31T11:42:21Z"])("omits an invalid or missing official observation %s without borrowing a newer date", observed_at => {
    const hours = { _official: { ...evidence, observed_at: observed_at as string } };
    expect(placeHoursProvenance({ ...merchant, hours, hours_updated_at: "2026-10-20T19:59:00Z" }, now))
      .toBe("Hours from Thai Meric Eatery & Bar.");
  });

  it("omits a future observation beyond five minutes of clock skew", () => {
    expect(placeHoursProvenance({ ...merchant, hours: { _official: { ...evidence, observed_at: "2026-10-20T20:06:00Z" } } }, now))
      .toBe("Hours from Thai Meric Eatery & Bar.");
    expect(placeHoursProvenance({ ...merchant, hours: { _official: { ...evidence, observed_at: "2026-10-20T20:05:00Z" } } }, now))
      .toBe("Hours from Thai Meric Eatery & Bar, observed Oct 20, 2026 at 4:05 PM ET.");
  });

  it("retains the original observation after the evidence expires", () => {
    expect(placeHoursProvenance(merchant, Date.parse("2026-11-15T20:00:00Z")))
      .toBe("Hours from Thai Meric Eatery & Bar, observed Oct 20, 2026 at 7:42 AM ET.");
  });

  it.each([
    ["2026-10-20T02:15:00Z", "Oct 19, 2026 at 10:15 PM"],
    ["2026-11-01T05:30:00Z", "Nov 1, 2026 at 1:30 AM"],
    ["2026-11-01T06:30:00Z", "Nov 1, 2026 at 1:30 AM"],
    ["2026-03-08T06:30:00Z", "Mar 8, 2026 at 1:30 AM"],
    ["2026-03-08T07:30:00Z", "Mar 8, 2026 at 3:30 AM"],
  ])("formats %s in Eastern time across midnight and DST", (observed_at, expected) => {
    expect(placeHoursProvenance({ ...merchant, hours: { _official: { ...evidence, observed_at } } }, Date.parse("2026-12-01T00:00:00Z")))
      .toBe(`Hours from Thai Meric Eatery & Bar, observed ${expected} ET.`);
  });

  it.each([
    ["google_places", "Google"],
    ["osm", "OpenStreetMap"],
    ["manual_override", "the Frederick Radius team"],
    ["first_party", "the official source"],
  ] as const)("preserves the historical %s label and recorded timestamp", (hours_source, label) => {
    expect(placeHoursProvenance({ hours_source, hours_updated_at: evidence.observed_at }, now))
      .toBe(`Hours from ${label}, observed Oct 20, 2026 at 7:42 AM ET.`);
    expect(placeHoursProvenance({ hours_source }, now)).toBe(`Hours from ${label}.`);
  });

  it("omits provenance when no actual source is recorded", () => {
    expect(placeHoursProvenance({ hours_updated_at: evidence.observed_at }, now)).toBeUndefined();
  });
});
