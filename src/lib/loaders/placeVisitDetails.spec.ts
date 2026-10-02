import { describe, expect, it } from "vitest";
import RAW from "@/data/place-visit-details.json";
import { placeVisitDetails, validatePlaceVisitDetails } from "./placeVisitDetails";

const valid = {
  status: "approved",
  reviewed_at: "2026-10-02T17:34:09.000Z",
  facts: [{ text: "The library lists wireless internet.", source_url: "https://www.fcpl.org/" }],
  actions: [{ label: "Read visit information", url: "https://www.fcpl.org/" }],
  unknowns: ["noise_level", "wheelchair_access"],
};

describe("reviewed place visit details", () => {
  it("fails closed for unreviewed records and malformed evidence", () => {
    for (const value of [null, {}, { ...valid, status: "candidate" },
      { ...valid, reviewed_at: "2026-02-30T00:00:00Z" },
      { ...valid, facts: [{ text: "A claim.", source_url: "javascript:alert(1)" }] },
      { ...valid, actions: [{ label: "Visit", url: "https://user:secret@example.com/" }] },
      { ...valid, unknowns: ["quiet"] }, { ...valid, unknowns: ["wifi", "wifi"] },
      { ...valid, facts: Array(7).fill(valid.facts[0]) },
    ]) expect(validatePlaceVisitDetails(value)).toBeNull();
    expect(placeVisitDetails("unknown-place")).toBeNull();
  });

  it("requires real ISO dates or zoned timestamps and never claims a future review", () => {
    const now = new Date("2026-10-03T02:00:00Z");
    for (const reviewed_at of ["10/2/2026", "2026-10-02T17:34:09", "2026-10-02T24:00:00Z",
      "2026-02-30", "2026-10-04", "2026-10-03T02:00:00.001Z"]) {
      expect(validatePlaceVisitDetails({ ...valid, reviewed_at }, now)).toBeNull();
    }
    for (const reviewed_at of ["2026-10-02", "2026-10-03T02:00:00Z", "2026-10-02T21:00:00-04:00"]) {
      expect(validatePlaceVisitDetails({ ...valid, reviewed_at }, now)).not.toBeNull();
    }
    expect(validatePlaceVisitDetails(valid, new Date("invalid"))).toBeNull();
  });

  it("binds committed pilot facts and actions to each reviewed owner or FCPL source", () => {
    const reviewedHosts: Record<string, string> = {
      "beans-in-the-belfry-brunswick": "beansinthebelfry.com",
      "smoketown-brewing-brunswick": "smoketownbrewing.com",
      "attaboy-beer-frederick": "attaboybeer.com",
      "c-burr-artz-public-library-frederick": "fcpl.org",
      "thurmont-regional-library-thurmont": "fcpl.org",
      "myersville-community-library-myersville": "fcpl.org",
    };
    expect(Object.keys(RAW).sort()).toEqual(Object.keys(reviewedHosts).sort());
    for (const [slug, entry] of Object.entries(RAW)) {
      const expectedHost = reviewedHosts[slug];
      for (const fact of entry.facts) {
        expect(new URL(fact.source_url).hostname.replace(/^www\./, "")).toBe(expectedHost);
      }
      for (const action of entry.actions) {
        const host = new URL(action.url).hostname.replace(/^www\./, "");
        const ownerLinkedMenu = slug === "beans-in-the-belfry-brunswick" &&
          action.url === "https://beans-in-the-belfry-103792.square.site/";
        expect(host === expectedHost || ownerLinkedMenu).toBe(true);
      }
    }
  });

  it("projects only reviewed detail fields, without publishing other payloads", () => {
    const details = validatePlaceVisitDetails({ ...valid, hours: { mon: [] }, hero_image: "https://example.com/unlicensed.jpg" });
    expect(details?.facts).toHaveLength(1);
    expect(details).not.toHaveProperty("hours");
    expect(details).not.toHaveProperty("hero_image");
    expect(details).not.toHaveProperty("status");
  });

  it("keeps the six-place pilot bounded and separates unknowns from supported Wi-Fi", () => {
    expect(Object.keys(RAW)).toHaveLength(6);
    for (const slug of Object.keys(RAW)) {
      const details = placeVisitDetails(slug);
      expect(details).not.toBeNull();
      expect(details!.unknowns).toContain("noise_level");
      expect(details!.unknowns).toContain("wheelchair_access");
      const library = slug.includes("library");
      expect(details!.unknowns.includes("wifi")).toBe(!library);
      if (library) expect(details!.facts.some(fact => /wireless internet/i.test(fact.text))).toBe(true);
    }
  });

  it("preserves venue restrictions instead of turning partial access into a blanket claim", () => {
    const attaboy = placeVisitDetails("attaboy-beer-frederick")!;
    expect(attaboy.facts.some(fact => /not the taproom/.test(fact.text))).toBe(true);
    expect(attaboy.facts.some(fact => /with a parent until 8 p.m./.test(fact.text))).toBe(true);
    const smoketown = placeVisitDetails("smoketown-brewing-brunswick")!;
    expect(smoketown.facts.some(fact => /patio/.test(fact.text))).toBe(true);
  });
});
