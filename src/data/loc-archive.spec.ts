import { describe, expect, it } from "vitest";
import { SANBORN_EDITIONS } from "./loc-archive";

describe("Library of Congress Sanborn previews", () => {
  it("uses the IIIF filename path rather than the dotted resource id", () => {
    for (const edition of SANBORN_EDITIONS) {
      expect(edition.image.url).toContain(
        `:g3844fm:g3844fm_g03603${edition.editionYear}:03603_${edition.editionYear}-0001/`,
      );
      expect(edition.image.url).not.toContain(":g3844fm:g3844fm.g3844fm_");
    }
  });
});
