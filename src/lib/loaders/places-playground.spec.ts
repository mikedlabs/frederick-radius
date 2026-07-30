import { describe, expect, it } from "vitest";
import { rankPlaces } from "@/lib/loaders/places";

describe("playground category evidence", () => {
  it("includes parent parks whose source-backed blurbs name a playground", () => {
    const slugs = new Set(
      rankPlaces({ category: "playground" }).map((place) => place.slug),
    );

    expect(slugs).toContain("riverwalk-park-frederick");
    expect(slugs).toContain("willowdale-park-frederick");
    expect(slugs).toContain("pinecliff-park-frederick");
    expect(slugs).toContain("middletown-park-middletown");
    expect(slugs).toContain("urbana-district-park-new-market");
    expect(slugs).toContain("utica-park-walkersville");
    expect(slugs).not.toContain("baker-park-frederick");
  });
});
