import { describe, it, expect } from "vitest";
import { searchCivicActions } from "./civic";

/**
 * The "how do I…" slice of the everything search. The live failure this
 * guards: "report a pothole" ranked a church, "animal control" a winery —
 * the county's own How-Do-I corpus was invisible to the search box.
 */
describe("searchCivicActions", () => {
  it("'report a pothole' finds FixIT, the county's own reporting door", () => {
    const r = searchCivicActions("report a pothole");
    expect(r[0]?.title).toMatch(/FixIT/i);
    expect(r[0]?.href).toContain("frederickcountymd.gov");
  });

  it("'voter registration' leads with the registration link", () => {
    expect(searchCivicActions("voter registration")[0]?.title).toMatch(/voter registration/i);
  });

  it("'marriage license' resolves the courts link", () => {
    expect(searchCivicActions("marriage license")[0]?.title).toMatch(/marriage/i);
  });

  it("'road closures' resolves the county closures page", () => {
    expect(searchCivicActions("road closures")[0]?.title).toMatch(/road closures/i);
  });

  it("'burn permit' resolves the health-department permit", () => {
    expect(searchCivicActions("burn permit")[0]?.title).toMatch(/burn permit/i);
  });

  it("place-shaped and noise queries never surface an action", () => {
    expect(searchCivicActions("coffee near me")).toEqual([]);
    expect(searchCivicActions("frederick")).toEqual([]);
    expect(searchCivicActions("best brunch downtown")).toEqual([]);
  });
});
