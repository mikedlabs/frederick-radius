import { describe, expect, it } from "vitest";
import { qualifiedSearch } from "@/lib/search";
import { queryWithoutSearchArea } from "./refinement";

describe("explicit search area changes", () => {
  it.each([
    ["coffee downtown", "coffee"],
    ["coffee in downtown Frederick", "coffee"],
    ["coffee in Brunswick tonight", "coffee tonight"],
    ["free events in north county tomorrow", "free events tomorrow"],
    ["coffee in the western part of Frederick County open now", "coffee open now"],
    ["Frederick Bodywork", "Frederick Bodywork"],
  ])("removes only geographic language from %s", (query, expected) => {
    expect(queryWithoutSearchArea(query)).toBe(expected);
  });

  it("lets the area selection replace downtown with Brunswick", () => {
    const query = queryWithoutSearchArea("coffee downtown");
    const { hits, meta } = qualifiedSearch(query, 20, [], { municipality: "brunswick", resultKind: "all" });
    const places = hits.flatMap((hit) => hit.type === "place" ? [hit.place] : []);
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((place) => place.municipality === "brunswick")).toBe(true);
    expect(meta.scopeMunicipality).toBe("brunswick");
  });

  it("still gives a typed destination priority over an ordinary browsing scope", () => {
    const { hits, meta } = qualifiedSearch("coffee in Brunswick", 20, [], { municipality: "thurmont", resultKind: "all" });
    expect(meta.scopeMunicipality).toBe("brunswick");
    expect(hits.filter((hit) => hit.type === "place").every((hit) => hit.place.municipality === "brunswick")).toBe(true);
  });
});
