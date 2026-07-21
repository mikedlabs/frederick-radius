import { describe, it, expect } from "vitest";
import { aggregate, type IncidentEntry } from "./scannerIncidents";
import type { PublicIncident } from "@/lib/scanner/incidentFeed";

// A minimal public incident stub; only the fields aggregate() groups on matter.
function inc(kind: PublicIncident["kind"], location: string, time = "9:00 pm"): PublicIncident {
  return { kind, location, time, roadImpact: kind === "Crash" };
}
const MIN = 60_000;

describe("aggregate — call-lifecycle grouping", () => {
  it("folds repeated posts of one call into a single lifecycle entry", () => {
    const now = Date.now();
    // Same working fire posted three times as the response grew.
    const entries: IncidentEntry[] = [
      { inc: inc("Structure fire", "700 block E Potomac St", "11:17 pm"), atMs: now - 20 * MIN },
      { inc: inc("Structure fire", "700 block E Potomac St", "11:24 pm"), atMs: now - 13 * MIN },
      { inc: inc("Structure fire", "700 block E Potomac St", "11:31 pm"), atMs: now - 6 * MIN },
    ];
    const out = aggregate(entries);
    expect(out).toHaveLength(1);
    expect(out[0].updates).toBe(3);
    // firstAt = earliest post, at = latest post.
    expect(Date.parse(out[0].firstAt)).toBe(now - 20 * MIN);
    expect(Date.parse(out[0].at)).toBe(now - 6 * MIN);
    // Latest post drives the shown clock time.
    expect(out[0].time).toBe("11:31 pm");
  });

  it("keeps distinct calls separate and sorts newest-active first", () => {
    const now = Date.now();
    const out = aggregate([
      { inc: inc("Crash", "Route 15 and Motter Ave"), atMs: now - 30 * MIN },
      { inc: inc("Wires down", "E B St and Ninth Ave"), atMs: now - 2 * MIN },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe("Wires down"); // most recently active
    expect(out.every((o) => o.updates === 1)).toBe(true);
  });

  it("drops posts older than the one-hour window", () => {
    const now = Date.now();
    const out = aggregate([
      { inc: inc("Crash", "Old Rd"), atMs: now - 90 * MIN },
      { inc: inc("Crash", "Fresh Rd"), atMs: now - 5 * MIN },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].location).toBe("Fresh Rd");
  });

  it("counts only in-window posts toward a call's update total", () => {
    const now = Date.now();
    const out = aggregate([
      { inc: inc("Structure fire", "Main St"), atMs: now - 70 * MIN }, // aged out
      { inc: inc("Structure fire", "Main St"), atMs: now - 40 * MIN },
      { inc: inc("Structure fire", "Main St"), atMs: now - 3 * MIN },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].updates).toBe(2);
    expect(Date.parse(out[0].firstAt)).toBe(now - 40 * MIN);
  });
});
