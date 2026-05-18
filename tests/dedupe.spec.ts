import { describe, it, expect } from "vitest";
import {
  normName,
  nameCore,
  isSamePlace,
  pickCanonical,
  autoFold,
  type DedupeRecord,
} from "@/lib/dedupe";

// Frederick downtown anchor; offsets below are ~realistic metres.
const C = { lng: -77.4105, lat: 39.4143 };
const near = (m: number) => ({ lng: C.lng, lat: C.lat + m / 111_320 });

function rec(p: Partial<DedupeRecord> & { slug: string; name: string }): DedupeRecord {
  return { geom: C, source: "dfp", ...p };
}

describe("normName / nameCore", () => {
  it("normalizes punctuation, case, ampersand, stopwords", () => {
    expect(normName("The Brewer's Alley & Restaurant")).toBe("brewer s alley and restaurant");
  });
  it("nameCore strips generic descriptors to the distinctive stem", () => {
    expect(nameCore("Clue IQ an Escape Room Experience")).toBe("clue iq escape room");
    expect(nameCore("Endangered Species Theatre Project Frederick")).toBe(
      "endangered species theatre project",
    );
  });
});

describe("isSamePlace — folds true duplicates", () => {
  it("folds on a shared Google Place ID at any distance", () => {
    const a = rec({ slug: "a", name: "Totally Different A", geom: C, google_place_id: "PID1" });
    const b = rec({
      slug: "b",
      name: "Totally Different B",
      geom: { lng: -77.6, lat: 39.7 },
      google_place_id: "PID1",
    });
    expect(isSamePlace(a, b)).toBe(true);
  });

  it("folds an exact normalized-name match within the radius", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Frederick Health", geom: C }),
        rec({ slug: "b", name: "frederick health!", geom: near(120) }),
      ),
    ).toBe(true);
  });

  it("folds the name-variant tail the old rule missed (Clue Iq)", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Clue IQ", geom: C, source: "dfp" }),
        rec({ slug: "b", name: "Clue Iq an Escape Room Experience", geom: near(90), source: "dfp" }),
      ),
    ).toBe(true);
  });

  it("folds 'Endangered Species Theatre Project' name variants", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Endangered Species Theatre Project" }),
        rec({ slug: "b", name: "The Endangered Species Theatre Project Frederick", geom: near(110) }),
      ),
    ).toBe(true);
  });
});

describe("isSamePlace — SAFELIST protects distinct places (scar tissue)", () => {
  it("never merges a park with its parking deck", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Carroll Creek Park", geom: C }),
        rec({ slug: "b", name: "Carroll Creek Parking Deck", geom: near(40) }),
      ),
    ).toBe(false);
  });

  it("never merges a park with its bandshell / trailhead / overlook", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Baker Park", geom: C }),
        rec({ slug: "b", name: "Baker Park Bandshell", geom: near(50) }),
      ),
    ).toBe(false);
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Gambrill State Park", geom: C }),
        rec({ slug: "b", name: "South Frederick Overlook at Gambrill State Park", geom: near(60) }),
      ),
    ).toBe(false);
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Catoctin Mountain Park", geom: C }),
        rec({ slug: "b", name: "Catoctin Mountain Park Chimney Rock Trailhead", geom: near(80) }),
      ),
    ).toBe(false);
  });

  it("never merges a numbered sub-feature ('Baker Park' vs 'Baker Park 6')", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Baker Park", geom: C }),
        rec({ slug: "b", name: "Baker Park 6", geom: near(30) }),
      ),
    ).toBe(false);
  });

  it("never merges a campus tenant with the campus", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Mount St. Mary's University", geom: C }),
        rec({ slug: "b", name: "Saxbys at Mount St. Mary's University", geom: near(70) }),
      ),
    ).toBe(false);
  });

  it("does not fold a same-name pair that is too far apart", () => {
    expect(
      isSamePlace(
        rec({ slug: "a", name: "Sweet Shop", geom: C }),
        rec({ slug: "b", name: "Sweet Shop", geom: { lng: -77.55, lat: 39.62 } }),
      ),
    ).toBe(false);
  });
});

describe("pickCanonical", () => {
  it("curated (seed/manual) always wins over a scrape", () => {
    const seed = rec({ slug: "s", name: "Cafe Nola", source: "seed" });
    const dfp = rec({ slug: "d", name: "Cafe Nola", source: "dfp", hasEnrichment: true });
    expect(pickCanonical(seed, dfp).slug).toBe("s");
    expect(pickCanonical(dfp, seed).slug).toBe("s");
  });
  it("between scrapes, the enriched one wins", () => {
    const a = rec({ slug: "a", name: "X", source: "dfp", hasEnrichment: false });
    const b = rec({ slug: "b", name: "X", source: "google", hasEnrichment: true });
    expect(pickCanonical(a, b).slug).toBe("b");
  });
});

describe("autoFold — deterministic, transitive, pin-aware", () => {
  it("collapses a transitive cluster (A~B, B~C) to ONE canonical", () => {
    const recs = [
      rec({ slug: "seed-x", name: "Frederick Coffee Company", source: "seed", geom: C }),
      rec({ slug: "dfp-x", name: "Frederick Coffee Co", source: "dfp", geom: near(40) }),
      rec({ slug: "ggl-x", name: "Frederick Coffee Co & Cafe", source: "google", geom: near(80) }),
    ];
    const fold = autoFold(recs);
    expect(fold.get("dfp-x")).toBe("seed-x");
    expect(fold.get("ggl-x")).toBe("seed-x");
    expect(fold.has("seed-x")).toBe(false);
    // no chains: every canonical target is itself unfolded
    for (const canon of fold.values()) expect(fold.has(canon)).toBe(false);
  });

  it("leaves genuinely distinct places untouched", () => {
    const recs = [
      rec({ slug: "park", name: "Carroll Creek Park", source: "seed", geom: C }),
      rec({ slug: "deck", name: "Carroll Creek Parking Deck", source: "dfp", geom: near(40) }),
    ];
    expect(autoFold(recs).size).toBe(0);
  });

  it("a pinned slug is never folded (manual veto escape hatch)", () => {
    const recs = [
      rec({ slug: "keep-me", name: "Mountainside Diner", source: "dfp", geom: C }),
      rec({ slug: "other", name: "Mountainside Diner", source: "dfp", geom: near(50) }),
    ];
    const fold = autoFold(recs, new Set(["keep-me"]));
    expect(fold.has("keep-me")).toBe(false);
    expect(fold.get("other")).toBeUndefined();
  });
});
