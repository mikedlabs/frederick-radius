import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("specialized business identity visuals", () => {
  it("carries each live truck's approved identity into the near-me card", () => {
    const nearMe = read("src/components/food-trucks/FoodTruckNearMe.tsx");
    const page = read("src/app/(app)/food-trucks/page.tsx");

    expect(nearMe).toContain("<FoodTruckIdentity");
    expect(nearMe).toContain("truck={truck}");
    expect(nearMe).toContain('size="thumb"');
    expect(page).toContain("kind: truck.kind");
    expect(page).toContain("truck.media ? { media: truck.media }");
  });

  it("uses canonical place media in live tap-list headers", () => {
    const source = read("src/components/beer/OnTapNow.tsx");

    expect(source).toContain("clientPlaceBySlug(menu.slug)");
    expect(source).toContain(
      "<PlaceMedallion place={breweryPlace} size={44} />",
    );
    expect(source).toContain('href={`/places/${menu.slug}`}');
    expect(source).toContain("details and photo credits");
  });

  it("uses canonical place media in the quiet-wire stage directory", () => {
    const source = read("src/app/(app)/live-music/page.tsx");

    expect(source).toContain("place: p");
    expect(source).toContain("<PlaceMedallion place={s.place} size={36} />");
  });
});
