import { describe, it, expect } from "vitest";
import { CIVIC_MOMENTS, activeMoment, momentBySlug } from "./civic-moments";

describe("activeMoment", () => {
  it("returns the Fourth during its Eastern window", () => {
    // 2026-07-03 ~10am ET (14:00Z) — inside July 1..5.
    const m = activeMoment(new Date("2026-07-03T14:00:00Z"));
    expect(m?.slug).toBe("fourth-of-july-2026");
  });

  it("shows through the end of the last day (Eastern), then retires", () => {
    // 2026-07-05 23:30 ET = 2026-07-06T03:30Z — still the 5th in Eastern.
    expect(activeMoment(new Date("2026-07-06T03:30:00Z"))?.slug).toBe("fourth-of-july-2026");
    // 2026-07-06 08:00 ET — window over.
    expect(activeMoment(new Date("2026-07-06T12:00:00Z"))).toBeNull();
  });

  it("is null well outside any window", () => {
    expect(activeMoment(new Date("2026-08-15T14:00:00Z"))).toBeNull();
  });
});

describe("momentBySlug", () => {
  it("finds a moment and 404s an unknown one", () => {
    expect(momentBySlug("fourth-of-july-2026")?.title).toContain("Fourth");
    expect(momentBySlug("nope")).toBeNull();
  });
});

describe("data integrity (a bad hand-edit fails here)", () => {
  it("every moment has a sane window and required fields", () => {
    for (const m of CIVIC_MOMENTS) {
      expect(m.slug).toMatch(/^[a-z0-9-]+$/);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.spotlightLead.length).toBeGreaterThan(0);
      expect(m.starts <= m.ends).toBe(true);
      expect(m.sections.length).toBeGreaterThan(0);
    }
  });

  it("every item is well-formed; sourced items use http and valid confidence", () => {
    for (const m of CIVIC_MOMENTS) {
      for (const s of m.sections) {
        for (const it of s.items) {
          expect(it.title.length).toBeGreaterThan(0);
          expect(["fireworks", "parade", "activity", "closure", "tip"]).toContain(it.kind);
          if (it.source_url) expect(it.source_url).toMatch(/^https?:\/\//);
          if (it.confidence) expect(["confirmed", "pattern"]).toContain(it.confidence);
        }
      }
    }
  });

  it("no em dashes in any user-facing moment copy", () => {
    const blob = JSON.stringify(CIVIC_MOMENTS);
    expect(blob).not.toContain("—");
  });
});
