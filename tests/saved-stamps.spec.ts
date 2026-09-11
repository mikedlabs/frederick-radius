import { describe, it, expect } from "vitest";
import { deriveStamps, MILESTONES, townDefs } from "@/lib/stamps";
import { MUNICIPALITIES } from "@/data/municipalities";

const EMPTY = {
  saved: [],
  visited: [],
  notesCount: 0,
  breweryVisits: 0,
  townOf: () => undefined,
};

const save = (type: string, id: string, saved_at = "2026-07-15T12:00:00Z") => ({ type, id, saved_at });

function byKey(states: ReturnType<typeof deriveStamps>, key: string) {
  const s = states.find((x) => x.def.key === key);
  if (!s) throw new Error("missing stamp " + key);
  return s;
}

describe("deriveStamps", () => {
  it("a brand-new user has earned nothing", () => {
    const states = deriveStamps(EMPTY);
    expect(states.some((s) => s.earned)).toBe(false);
    // full def set: milestones + one per municipality + full county
    expect(states).toHaveLength(MILESTONES.length + townDefs().length + 1);
  });

  it("first save earns First mark only (of the save-count stamps)", () => {
    const states = deriveStamps({ ...EMPTY, saved: [save("place", "a")] });
    expect(byKey(states, "first-mark").earned).toBe(true);
    expect(byKey(states, "the-dozen").earned).toBe(false);
    expect(byKey(states, "the-dozen").progress).toEqual({ done: 1, need: 12 });
  });

  it("beers, events, notes, visits and brewery visits earn their stamps", () => {
    const states = deriveStamps({
      ...EMPTY,
      saved: [
        ...Array.from({ length: 6 }, (_, i) => save("beer", "b" + i)),
        ...Array.from({ length: 3 }, (_, i) => save("event", "e" + i)),
      ],
      visited: Array.from({ length: 10 }, (_, i) => "v" + i),
      notesCount: 3,
      breweryVisits: 5,
    });
    for (const key of ["on-tap", "flight-six", "calendar-keeper", "boots-on", "ten-boots", "margin-writer", "brewery-trail"]) {
      expect(byKey(states, key).earned, key).toBe(true);
    }
  });

  it("four seasons needs four DISTINCT months", () => {
    const three = deriveStamps({
      ...EMPTY,
      saved: [
        save("place", "a", "2026-01-10T00:00:00Z"),
        save("place", "b", "2026-01-20T00:00:00Z"),
        save("place", "c", "2026-02-01T00:00:00Z"),
        save("place", "d", "2026-03-01T00:00:00Z"),
      ],
    });
    expect(byKey(three, "four-seasons").earned).toBe(false);
    expect(byKey(three, "four-seasons").progress.done).toBe(3);

    const four = deriveStamps({
      ...EMPTY,
      saved: [
        save("place", "a", "2026-01-10T00:00:00Z"),
        save("place", "b", "2026-02-20T00:00:00Z"),
        save("place", "c", "2026-03-01T00:00:00Z"),
        save("place", "d", "2026-04-01T00:00:00Z"),
      ],
    });
    expect(byKey(four, "four-seasons").earned).toBe(true);
  });

  it("town stamps earn via save OR visit, and unhydrated slugs never mis-stamp", () => {
    const towns: Record<string, string> = { "cafe-a": "brunswick", "trail-b": "thurmont" };
    const states = deriveStamps({
      ...EMPTY,
      saved: [save("place", "cafe-a"), save("place", "mystery-place")],
      visited: ["trail-b"],
      townOf: (slug) => towns[slug],
    });
    expect(byKey(states, "town-brunswick").earned).toBe(true);
    expect(byKey(states, "town-thurmont").earned).toBe(true);
    expect(byKey(states, "town-frederick").earned).toBe(false);
    expect(byKey(states, "full-county").progress.done).toBe(2);
  });

  it("full county closes when every municipality is stamped", () => {
    const all = MUNICIPALITIES.map((m) => m.slug);
    const states = deriveStamps({
      ...EMPTY,
      saved: all.map((slug, i) => save("place", "p" + i)),
      townOf: (slug) => all[Number(slug.slice(1))],
    });
    expect(byKey(states, "full-county").earned).toBe(true);
  });
});
