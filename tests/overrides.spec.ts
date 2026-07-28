import { describe, it, expect } from "vitest";
import {
  makeResolver,
  patchRecord,
  levenshtein,
  nearDupeCandidates,
  type DupeRecord,
} from "@/lib/overrides";

describe("makeResolver — chain-safe canonical resolution", () => {
  it("follows auto then human folds to the final survivor", () => {
    const auto = new Map([["a", "b"]]);
    const human = { b: "c" }; // b was itself folded by a human override
    const r = makeResolver([human, auto]);
    expect(r("a")).toBe("c");
    expect(r("b")).toBe("c");
    expect(r("c")).toBe("c");
    expect(r("z")).toBe("z");
  });
  it("never hangs on a malformed cycle", () => {
    const r = makeResolver([{ a: "b", b: "a" }]);
    expect(["a", "b"]).toContain(r("a"));
  });
});

describe("patchRecord", () => {
  it("overlays only the patched fields, identity otherwise", () => {
    const p = { slug: "x", name: "Old", category: "restaurant", short_blurb: "b" };
    expect(patchRecord(p, undefined)).toBe(p);
    const out = patchRecord(p, {
      x: { name: "New", category: "cafe", subcategories: ["restaurant"] },
    });
    expect(out).toEqual({
      slug: "x",
      name: "New",
      category: "cafe",
      subcategories: ["restaurant"],
      short_blurb: "b",
    });
    expect(p.name).toBe("Old"); // input not mutated
  });

  it("can explicitly clear an unsafe public blurb", () => {
    const p = {
      slug: "x",
      name: "Example",
      short_blurb: "100 Main Street Frederick, MD 21701 Directory copy.",
    };

    expect(
      patchRecord(p, { x: { short_blurb: "" } }),
    ).toEqual({
      ...p,
      short_blurb: "",
    });
  });

  it("only verifies a manual hours patch when it carries field-specific evidence", () => {
    const p = {
      slug: "x",
      hours_verified: false,
      updated_at: "2026-07-28T12:00:00.000Z",
    };
    const hours = {
      mon: [{ open: "09:00", close: "17:00" }],
    };

    expect(patchRecord(p, { x: { hours } })).toEqual({
      ...p,
      hours,
      hours_verified: false,
    });
    expect(
      patchRecord(p, {
        x: {
          hours,
          hours_updated_at: "2026-07-27T15:00:00.000Z",
        },
      }),
    ).toEqual({
      ...p,
      hours,
      hours_updated_at: "2026-07-27T15:00:00.000Z",
      hours_verified: true,
    });
  });

  it("does not let old verification evidence attach to a changed schedule", () => {
    const p = {
      slug: "x",
      hours: {
        mon: [{ open: "08:00", close: "16:00" }],
      },
      hours_verified: true,
      hours_updated_at: "2026-07-01T12:00:00.000Z",
    };
    const replacement = {
      mon: [{ open: "09:00", close: "17:00" }],
    };

    expect(patchRecord(p, { x: { hours: replacement } })).toEqual({
      slug: "x",
      hours: replacement,
      hours_verified: false,
    });
  });
});

describe("levenshtein (bounded)", () => {
  it("measures the Summitra/Sumittra typo distance", () => {
    expect(levenshtein("summitra", "sumittra")).toBe(2);
  });
  it("returns max+1 once it blows the budget (cheap reject)", () => {
    expect(levenshtein("abcdef", "zzzzzzzzzzzz", 2)).toBe(3);
  });
});

const C = { lng: -77.4104, lat: 39.414 };
const near = (m: number) => ({ lng: C.lng, lat: C.lat + m / 111_320 });
function rec(p: Partial<DupeRecord> & { slug: string; name: string }): DupeRecord {
  return { municipality: "frederick", source: "dfp", ...C, ...p };
}

describe("nearDupeCandidates — finds the judgement tail the engine skips", () => {
  it("flags the real Summitra / Sumittra Thai Cuisine pair", () => {
    const recs = [
      rec({ slug: "summitra", name: "Summitra", ...C }),
      rec({ slug: "sumittra-thai-cuisine", name: "Sumittra Thai Cuisine", ...near(7) }),
    ];
    const cands = nearDupeCandidates(recs);
    expect(cands).toHaveLength(1);
    expect(new Set([cands[0].a.slug, cands[0].b.slug])).toEqual(
      new Set(["summitra", "sumittra-thai-cuisine"]),
    );
    expect(cands[0].score).toBeGreaterThan(0.3);
    expect(cands[0].distance_m).toBeLessThan(10);
  });

  it("does NOT flag genuinely distinct close places", () => {
    const recs = [
      rec({ slug: "river-pub", name: "River Pub", ...C }),
      rec({ slug: "river-park", name: "River Park", ...near(20) }),
      rec({ slug: "saxbys", name: "Saxbys at Mount St Marys", ...near(30) }),
      rec({ slug: "msmu", name: "Mount St Marys University", ...near(40) }),
    ];
    const cands = nearDupeCandidates(recs);
    const pairs = cands.map((c) => [c.a.slug, c.b.slug].sort().join("::"));
    expect(pairs).not.toContain("river-park::river-pub");
  });

  it("ignores pairs in different municipalities or too far apart", () => {
    const recs = [
      rec({ slug: "a", name: "Summitra", municipality: "frederick", ...C }),
      rec({ slug: "b", name: "Sumittra", municipality: "thurmont", ...near(5) }),
      rec({ slug: "c", name: "Sumittra", municipality: "frederick", lng: -77.6, lat: 39.62 }),
    ];
    expect(nearDupeCandidates(recs)).toHaveLength(0);
  });

  it("does not turn neighboring features in different categories into shared-token duplicates", () => {
    const recs = [
      rec({
        slug: "park-playground",
        name: "New Market Community Park Playground",
        category: "playground",
        ...C,
      }),
      rec({
        slug: "park-pavilion",
        name: "New Market Community Park Pavilion",
        category: "park",
        ...near(20),
      }),
    ];
    expect(nearDupeCandidates(recs)).toHaveLength(0);
  });
});
