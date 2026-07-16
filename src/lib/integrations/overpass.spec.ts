import { describe, expect, it } from "vitest";
import { mapTagToCategory } from "@/lib/integrations/overpass";

describe("OpenStreetMap public-utility classification", () => {
  it("never treats an ornamental fountain as drinking water", () => {
    expect(mapTagToCategory({ amenity: "fountain" })).toBeNull();
  });

  it("accepts a fountain only when potable water is explicit", () => {
    expect(mapTagToCategory({ amenity: "fountain", drinking_water: "yes" })).toEqual({
      category_slug: "water",
      osm_tag: "amenity=fountain",
    });
  });

  it("does not present a natural spring as a verified drinking fixture", () => {
    expect(mapTagToCategory({ amenity: "drinking_water", natural: "spring" })).toBeNull();
  });

  it("keeps dog-waste baskets out of the generic trash layer", () => {
    expect(mapTagToCategory({ amenity: "waste_basket", waste: "dog_excrement" })).toEqual({
      category_slug: "dog-waste",
      osm_tag: "amenity=waste_basket,waste=dog_excrement",
    });
  });
});
