import { describe, expect, it } from "vitest";
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import { isPaidGooglePhotoUrl } from "@/lib/google-photo-policy";
import { freeSearchPlaceVisual } from "./place-visual";
import { searchIndex } from "./index";

const place = (slug: string) => clientPlaceBySlug(slug)!;

describe("free exact place photography in Find", () => {
  it("uses the owner's exact Creek photograph without a credit requirement", () => {
    expect(freeSearchPlaceVisual(place("carroll-creek-linear-park-frederick"))).toMatchObject({
      kind: "owned", src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg", alt: "Carroll Creek in Frederick.",
    });
  });

  it.each(["cunningham-falls-state-park-thurmont", "baker-park-frederick", "barbara-fritchie-house-frederick", "catoctin-furnace-thurmont"])("preserves the exact reviewed Commons source and credit for %s", (slug) => {
    const photo = freeSearchPlaceVisual(place(slug));
    expect(photo?.kind).toBe("curated");
    if (photo?.kind !== "curated") throw new Error("Expected a reviewed landmark source.");
    expect(photo.photo.verified).toBe(true);
    expect(photo.src).toContain("https://commons.wikimedia.org/wiki/Special:FilePath/");
    expect(photo.photo.source_url).toContain("https://commons.wikimedia.org/wiki/File:");
    expect(photo.photo.author).toBeTruthy();
    expect(photo.photo.license).toBeTruthy();
    expect(isPaidGooglePhotoUrl(photo.src)).toBe(false);
  });

  it("keeps ordinary coffee typeahead free of Google photos", () => {
    const coffee = place("cugino-forno-frederick");
    expect(coffee.google_photo_url).toContain("/api/place-photo?");
    expect(freeSearchPlaceVisual(coffee)).toBeNull();
    const result = searchIndex("Cugino Forno", 12, []).find((row) => row.id === `place:${coffee.slug}`);
    expect(result?.thumbnail).toBeUndefined();
    expect(result?.thumbnailSource).toBeUndefined();
  });

  it("carries the same exact source through live Find results", () => {
    for (const [query, slug] of [["Carroll Creek", "carroll-creek-linear-park-frederick"], ["Cunningham Falls", "cunningham-falls-state-park-thurmont"]]) {
      const expected = freeSearchPlaceVisual(place(slug));
      const result = searchIndex(query, 20, []).find((row) => row.id === `place:${slug}`);
      expect(result?.thumbnailSource).toEqual(expected);
      expect(result?.thumbnail).toBe(expected?.src);
    }
  });

  it("never returns paid media or an unrelated town/category image for any current place", () => {
    const photos = clientPlaces().map(freeSearchPlaceVisual).filter(Boolean);
    expect(photos).toHaveLength(9);
    expect(photos.some((photo) => isPaidGooglePhotoUrl(photo?.src))).toBe(false);
    expect(freeSearchPlaceVisual({ slug: "unreviewed-place", google_photo_url: "https://images.example.com/coffee.jpg", google_photo_attribution: undefined })).toBeNull();
  });
});
