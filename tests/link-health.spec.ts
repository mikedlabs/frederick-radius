import { describe, it, expect } from "vitest";
import { verdictForStatus, sliceForCycle } from "@/lib/quality/link-health";

/**
 * Link health (4.4). The network checker is exercised by the cron; these
 * tests pin the pure decision logic: what counts as dead, and that the
 * rotating slice partitions the whole list across a cycle with no gaps
 * and no overlap.
 */
describe("verdictForStatus", () => {
  it("treats gone-page statuses as dead", () => {
    for (const s of [404, 410, 451, 500, 502, 503]) {
      expect(verdictForStatus("https://x", s).ok).toBe(false);
      expect(verdictForStatus("https://x", s).reason).toBe("dead");
    }
  });

  it("treats reachable and bot-policy statuses as ok", () => {
    // 200 healthy; 403/405 are bot policy, not a gone page, so not dead.
    for (const s of [200, 204, 301, 302, 403, 405]) {
      expect(verdictForStatus("https://x", s).ok).toBe(true);
    }
  });
});

describe("sliceForCycle", () => {
  it("partitions the whole list across the cycle exactly once", () => {
    const urls = Array.from({ length: 500 }, (_, i) => `https://site-${i}.example/page`);
    const cycle = 7;
    const seen = new Set<string>();
    for (let day = 0; day < cycle; day++) {
      for (const u of sliceForCycle(urls, cycle, day)) {
        expect(seen.has(u)).toBe(false); // no URL appears on two days
        seen.add(u);
      }
    }
    expect(seen.size).toBe(urls.length); // every URL appears on exactly one day
  });

  it("is deterministic: a URL lands on the same day each run", () => {
    const u = ["https://stable.example/x"];
    const day = [0, 1, 2, 3, 4, 5, 6].find((d) => sliceForCycle(u, 7, d).length === 1);
    expect(typeof day).toBe("number");
    expect(sliceForCycle(u, 7, day!).length).toBe(1);
  });
});
