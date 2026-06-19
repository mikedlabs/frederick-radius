import { describe, it, expect } from "vitest";
import { getCuratedAdvisories, type CuratedAlert } from "@/lib/integrations/civicAlerts";

const base: CuratedAlert = {
  id: "x",
  title: "Test advisory.",
  source: "City of Frederick",
  url: "https://example.gov/#x",
  startsAt: "2026-06-19T00:00:00-04:00",
  expiresAt: "2026-06-26T23:59:59-04:00",
};
const at = (iso: string) => Date.parse(iso);

describe("getCuratedAdvisories", () => {
  it("emits an alert only inside its [startsAt, expiresAt] window", () => {
    const within = getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [base]);
    expect(within).toHaveLength(1);
    expect(within[0]).toMatchObject({ lane: "advisory", sourceShort: "City", url: base.url });

    expect(getCuratedAdvisories(at("2026-06-01T12:00:00-04:00"), [base])).toHaveLength(0); // before
    expect(getCuratedAdvisories(at("2026-07-01T12:00:00-04:00"), [base])).toHaveLength(0); // expired
  });

  it("derives the County source pip and drops malformed windows", () => {
    const county = { ...base, source: "Frederick County" as const };
    expect(getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [county])[0].sourceShort).toBe("County");

    const bad = { ...base, expiresAt: "not-a-date" };
    expect(getCuratedAdvisories(at("2026-06-20T12:00:00-04:00"), [bad])).toHaveLength(0);
  });

  it("returns newest-window-first", () => {
    const older = { ...base, id: "old", startsAt: "2026-06-19T00:00:00-04:00", url: "https://example.gov/#old" };
    const newer = { ...base, id: "new", startsAt: "2026-06-21T00:00:00-04:00", url: "https://example.gov/#new" };
    const out = getCuratedAdvisories(at("2026-06-22T12:00:00-04:00"), [older, newer]);
    expect(out.map((a) => a.url)).toEqual(["https://example.gov/#new", "https://example.gov/#old"]);
  });
});
