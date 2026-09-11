import { describe, expect, it } from "vitest";
import { resolveHomeBase } from "./live";

describe("resolveHomeBase", () => {
  it("keeps a real brewery home base whatever the hours-freshness state", () => {
    // Data-coupled invariant, not a snapshot of freshness: this fixture
    // originally pinned "stale hours withheld" (hours undefined, verified
    // false) and flipped the day the 2026-08-06 refresh made Monocacy
    // Brewing fresh again. The contract worth testing is that the home
    // base resolves regardless, and that hours are exposed exactly when
    // the schedule is verified.
    const r = resolveHomeBase("Monocacy Brewing Company");
    expect(r).not.toBeNull();
    expect(r?.slug).toBe("monocacy-brewing-frederick");
    if (r?.verified) {
      expect(r.hours).toBeDefined();
    } else {
      expect(r?.hours).toBeUndefined();
    }
  });

  it("resolves a shortened/variant venue name via prefix match", () => {
    // Roster says "RAK Brewing"; the place is "RAK Brewing Co".
    const r = resolveHomeBase("RAK Brewing");
    expect(r?.slug).toBe("rak-brewing-co-frederick");
  });

  it("returns null for an unknown or empty home base", () => {
    expect(resolveHomeBase("Some Field That Is Not A Venue")).toBeNull();
    expect(resolveHomeBase(undefined)).toBeNull();
    expect(resolveHomeBase("")).toBeNull();
  });
});
