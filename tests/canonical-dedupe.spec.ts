import { describe, it, expect } from "vitest";
import { PLACES } from "@/data/places";
import { applyDedup } from "@/lib/loaders/places";

/**
 * Canonical dedupe gate (data brief 4.2): zero place pairs may share a
 * normalized name within 75 meters in the same category group. The
 * dedupe key matches the brief: lowercased name, punctuation stripped,
 * business suffixes removed, plus proximity, plus category group. The
 * live set passes today; this test keeps every future data drop honest.
 */
function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(llc|inc|co|company|restaurant|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

describe("canonical place dedupe (data brief 4.2)", () => {
  it("no two live places share a normalized name within 75m in one category group", () => {
    const live = applyDedup(PLACES);
    const byKey = new Map<string, typeof live>();
    for (const p of live) {
      const key = `${normName(p.name)}|${(p.category ?? "").split("-")[0]}`;
      const arr = byKey.get(key) ?? [];
      arr.push(p);
      byKey.set(key, arr);
    }
    const violations: string[] = [];
    for (const grp of byKey.values()) {
      if (grp.length < 2) continue;
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          if (distMeters(grp[i].geom, grp[j].geom) <= 75) {
            violations.push(`${grp[i].slug} <-> ${grp[j].slug}`);
          }
        }
      }
    }
    expect(violations, `duplicate canonical pairs: ${violations.slice(0, 8).join(", ")}`).toEqual([]);
  });
});
