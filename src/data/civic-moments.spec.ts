import path from "node:path";
import sharp from "sharp";
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

  it("keeps the Fair's independent-guide boundary in its public data", () => {
    expect(momentBySlug("great-frederick-fair-2026")?.disclosure).toBe(
      "Radius is an independent local guide. Fair details come from official Fair sources linked below.",
    );
  });

  it("keeps the finished In The Streets photograph attributed and correctly sized", () => {
    const streets = momentBySlug("in-the-street-2026");
    expect(streets?.spotlightImage).toEqual({
      src: "/images/moments/in-the-streets-2024-mike-d.jpg",
      alt: "A packed Market Street during In The Streets in downtown Frederick, photographed in 2024.",
      credit: "Photograph by Mike D · In The Streets 2024",
      width: 1920,
      height: 1078,
    });
    expect(streets?.spotlightDirectionsUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Market%20Street%2C%20Frederick%2C%20MD",
    );
  });

  it("ships the In The Streets image without private capture metadata", async () => {
    const metadata = await sharp(
      path.join(process.cwd(), "public/images/moments/in-the-streets-2024-mike-d.jpg"),
    ).metadata();

    expect([metadata.width, metadata.height]).toEqual([1920, 1078]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("puts the In The Streets day in chronological order", () => {
    const timeline = momentBySlug("in-the-street-2026")?.sections.find(
      (section) => section.heading === "Today's timeline",
    );

    expect(timeline?.items.map((item) => item.title)).toEqual([
      "Market Street Mile",
      "In The Streets festival",
      "Craft Beverage Experience",
      "Up The Creek party",
    ]);
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
      for (const fact of m.spotlightFacts ?? []) {
        expect(fact.label.trim().length).toBeGreaterThan(0);
        expect(fact.value.trim().length).toBeGreaterThan(0);
      }
      if (m.spotlightImage) {
        expect(m.spotlightImage.src).toMatch(/^\/images\/moments\/.+\.(?:jpg|jpeg|webp)$/);
        expect(m.spotlightImage.alt.trim().length).toBeGreaterThan(0);
        expect(m.spotlightImage.credit.trim().length).toBeGreaterThan(0);
        expect(m.spotlightImage.width).toBeGreaterThan(0);
        expect(m.spotlightImage.height).toBeGreaterThan(0);
      }
      if (m.spotlightSourceUrl) {
        expect(m.spotlightSourceUrl).toMatch(/^https?:\/\//);
      }
      if (m.spotlightDirectionsUrl) {
        expect(m.spotlightDirectionsUrl).toMatch(/^https?:\/\//);
      }
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

  it("every FAQ entry is a well-formed question and answer", () => {
    for (const m of CIVIC_MOMENTS) {
      for (const f of m.faq ?? []) {
        expect(f.q.trim().length).toBeGreaterThan(0);
        expect(f.q.trim().endsWith("?")).toBe(true);
        expect(f.a.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("no em dashes in any user-facing moment copy", () => {
    const blob = JSON.stringify(CIVIC_MOMENTS);
    expect(blob).not.toContain("—");
  });
});
