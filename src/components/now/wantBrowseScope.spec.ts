import { describe, expect, it } from "vitest";
import {
  resolveWantBrowseScope,
  withWantBrowseScope,
} from "./wantBrowseScope";

const playgrounds =
  "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme";

describe("Today browse location handoff", () => {
  it("preserves an explicitly selected town", () => {
    const scope = resolveWantBrowseScope("town:brunswick");

    expect(scope).toBe("town:brunswick");
    expect(withWantBrowseScope(playgrounds, scope)).toBe(
      "/map?intent=outside&sub=playgrounds&amenity=play&in=brunswick",
    );
  });

  it("preserves an explicit whole-county choice", () => {
    const scope = resolveWantBrowseScope("county");

    expect(scope).toBe("county");
    expect(withWantBrowseScope(playgrounds, scope)).toContain("in=county");
  });

  it("keeps the current Near me map flow when no area was selected", () => {
    expect(resolveWantBrowseScope(null)).toBe("nearme");
    expect(resolveWantBrowseScope("nearme")).toBe("nearme");
    expect(withWantBrowseScope(playgrounds, "nearme")).toContain(
      "in=nearme",
    );
  });

  it("does not rewrite unrelated destinations", () => {
    expect(withWantBrowseScope("/nearby?c=coffee", "town:thurmont")).toBe(
      "/nearby?c=coffee",
    );
    expect(withWantBrowseScope("/parks", "nearme")).toBe("/parks");
  });
});
