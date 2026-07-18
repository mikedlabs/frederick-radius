import { describe, expect, it } from "vitest";
import { placeDietaryEvidence, placeMatchesDietary } from "./dietary";

describe("dietary evidence", () => {
  it("requires explicit catalog evidence instead of inferring from cuisine", () => {
    expect(placeMatchesDietary({ name: "Generic Cafe", tags: ["restaurant"] }, ["gluten-free"])).toBe(false);
    expect(placeDietaryEvidence({ name: "Cafe", tags: ["gluten-free", "vegan options"] }, ["gluten-free", "vegan"]))
      .toEqual(["gluten-free", "vegan"]);
  });
});
