import { describe, expect, it } from "vitest";
import { shouldInitializeReferenceLayer } from "./subject-map";

describe("subject map layer isolation", () => {
  it("keeps full-map reference-layer preferences off embedded subject maps", () => {
    expect(shouldInitializeReferenceLayer(true, true)).toBe(false);
  });

  it("preserves explicit reference layers on the full county map", () => {
    expect(shouldInitializeReferenceLayer(false, true)).toBe(true);
    expect(shouldInitializeReferenceLayer(false, false)).toBe(false);
  });
});
