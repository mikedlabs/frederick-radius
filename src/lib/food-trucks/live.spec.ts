import { describe, expect, it } from "vitest";
import { resolveHomeBase } from "./live";

describe("resolveHomeBase", () => {
  it("keeps a real brewery home base even while stale hours are withheld", () => {
    const r = resolveHomeBase("Monocacy Brewing Company");
    expect(r).not.toBeNull();
    expect(r?.slug).toBe("monocacy-brewing-frederick");
    expect(r?.hours).toBeUndefined();
    expect(r?.verified).toBe(false);
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
