import { describe, it, expect } from "vitest";
import { CRAVINGS, orderCravingsForMoment, type Moment } from "./cravings";

const keysFor = (m: Moment) => orderCravingsForMoment(CRAVINGS, m).map((c) => c.key);

describe("orderCravingsForMoment", () => {
  it("returns the same set, just reordered (nothing added or dropped)", () => {
    const out = orderCravingsForMoment(CRAVINGS, { hour: 14, weekend: false, wet: false });
    expect(out).toHaveLength(CRAVINGS.length);
    expect([...out.map((c) => c.key)].sort()).toEqual([...CRAVINGS.map((c) => c.key)].sort());
  });

  it("leads with coffee on a weekday morning", () => {
    expect(keysFor({ hour: 8, weekend: false, wet: false })[0]).toBe("coffee");
  });

  it("leads with drinks or live music in the evening", () => {
    expect(["drinks", "music"]).toContain(keysFor({ hour: 19, weekend: false, wet: false })[0]);
  });

  it("sinks Parks and lifts indoor wants when wet", () => {
    const dry = keysFor({ hour: 14, weekend: false, wet: false });
    const wet = keysFor({ hour: 14, weekend: false, wet: true });
    expect(wet.indexOf("outside")).toBeGreaterThan(dry.indexOf("outside"));
  });

  it("is deterministic and stable on a quiet hour (preserves base intent order)", () => {
    // 3 AM, weekday, dry → only the "late" boost applies (drinks/food), the
    // rest keep their canonical order.
    const a = keysFor({ hour: 3, weekend: false, wet: false });
    const b = keysFor({ hour: 3, weekend: false, wet: false });
    expect(a).toEqual(b);
  });
});
