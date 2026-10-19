import { describe, expect, it } from "vitest";
import { clientPlaces, clientPlaceBySlug } from "@/lib/loaders/places-client";
import { isPaidGooglePhotoUrl } from "@/lib/google-photo-policy";
import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import { OWNED_PLACE_PHOTOS } from "@/lib/owned-place-photos";
import { LANDMARK_PHOTOS, curatedPhotoUrl } from "@/lib/integrations/wikimedia";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { freeSearchPlaceVisual } from "./place-visual";
import { searchIndex } from "./index";

const place = (slug: string) => clientPlaceBySlug(slug)!;

describe("free exact place photography in Find", () => {
  it("uses the owner's exact Creek photograph without a credit requirement", () => {
    expect(freeSearchPlaceVisual(place("carroll-creek-linear-park-frederick"))).toMatchObject({
      kind: "owned", src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg", alt: "Carroll Creek in Frederick.",
    });
  });

  it.each([
    ["McCurdy Field", "mccurdy-field", "/images/seasons/spring/aerial-view-baseball-field.jpg",
      "An aerial view of McCurdy Field and the surrounding Frederick neighborhood."],
    ["Frederick Fairgrounds", "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick", "/images/fair/fairgrounds-night-mike-d-1920.jpg",
      "Frederick Fairgrounds at night during The Great Frederick Fair."],
  ])("leads the real Find query with the reviewed owned image for %s", (query, slug, src, alt) => {
    const input = place(slug);
    const photo = freeSearchPlaceVisual(input);
    expect(photo).toMatchObject({ kind: "owned", src, alt });
    expect(photo).not.toHaveProperty("attribution");
    expect(photo?.kind === "owned" ? photo.objectPosition ?? "center" : undefined)
      .toBe(slug === "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick" ? "right" : "center");
    expect(isPaidGooglePhotoUrl(photo!.src)).toBe(false);
    expect(placeCardPhotoPlan(input, 360).sources[0]).toEqual(photo);
    const result = searchIndex(query, 20, [])[0];
    expect(result?.id).toBe(`place:${slug}`);
    expect(result?.thumbnail).toBe(src);
    expect(result?.thumbnailSource).toEqual(photo);
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

  it.each([
    ["Schifferstadt", "schifferstadt-architectural-museum-frederick", "/history-photos/schifferstadt.jpg"],
    ["Hessian Barracks", "hessian-barracks-frederick-maryland", "/history-photos/hessian-barracks.jpg"],
    ["Canal Lock 30", "co-canal-lock-30-brunswick", "/history-photos/co-canal.jpg"],
  ])("carries the exact local licensed image and source through Find for %s", (query, slug, src) => {
    const photo = freeSearchPlaceVisual(place(slug));
    expect(photo).toMatchObject({ kind: "curated", src });
    if (photo?.kind !== "curated") throw new Error("Expected a credited local source.");
    expect(photo.photo.licenseUrl).toMatch(/^https:\/\/creativecommons.org\/licenses\/by-sa\/(3|4)\.0\/$/);
    expect(photo.photo.modifications).toContain("converted");
    const result = searchIndex(query, 20, []).find((row) => row.id === `place:${slug}`);
    expect(result?.thumbnail).toBe(src);
    expect(result?.thumbnailSource).toEqual(photo);
  });

  it("gives Brewer's Alley an exact free local Find photo with dated exterior credit", () => {
    const photo = freeSearchPlaceVisual(place("brewers-alley-frederick"));
    expect(photo).toMatchObject({
      kind: "curated", src: "/place-photos/brewers-alley-2004.jpg",
      photo: { author: "Stacy (Rambling Traveler)", license: "CC BY-SA 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/" },
    });
    if (photo?.kind !== "curated") throw new Error("Expected the reviewed Brewer's Alley photograph.");
    expect(photo.photo.modifications).toContain("Side alley exterior, October 26, 2004");
    const result = searchIndex("Brewer's Alley", 20, []).find((row) => row.id === "place:brewers-alley-frederick");
    expect(result?.thumbnail).toBe(photo.src);
    expect(result?.thumbnailSource).toEqual(photo);
    expect(isPaidGooglePhotoUrl(photo.src)).toBe(false);
  });

  it.each([
    ["Delaplaine", "delaplaine-arts-center-frederick"],
    ["Weinberg Center", "weinberg-center-for-the-arts-frederick"],
    ["C Burr Artz", "c-burr-artz-public-library-frederick"],
  ] as const)("preserves the registered local subject and license through Find for %s", (query, slug) => {
    const expected = CREDITED_LOCAL_PLACE_PHOTOS[slug].image;
    const photo = freeSearchPlaceVisual(place(slug));
    expect(photo).toMatchObject({
      kind: "curated", src: expected.src, alt: expected.alt,
      photo: { author: expected.creator, source_url: expected.source_url,
        license: expected.license.label, licenseUrl: expected.license.url, modifications: expected.modifications },
    });
    const result = searchIndex(query, 20, []).find((row) => row.id === `place:${slug}`);
    expect(result?.thumbnail).toBe(expected.src);
    expect(result?.thumbnailSource).toEqual(photo);
    expect(isPaidGooglePhotoUrl(photo!.src)).toBe(false);
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
    const catalog = clientPlaces();
    const approvedSlugs = new Set([
      ...Object.keys(OWNED_PLACE_PHOTOS),
      ...Object.entries(LANDMARK_PHOTOS).filter(([, photo]) => photo.verified).map(([slug]) => slug),
    ]);
    const shownSlugs: string[] = [];
    for (const candidate of catalog) {
      const photo = freeSearchPlaceVisual(candidate);
      if (!approvedSlugs.has(candidate.slug)) {
        expect(photo, candidate.slug).toBeNull();
        continue;
      }
      expect(photo, candidate.slug).not.toBeNull();
      expect(isPaidGooglePhotoUrl(photo!.src), candidate.slug).toBe(false);
      shownSlugs.push(candidate.slug);
      const owned = OWNED_PLACE_PHOTOS[candidate.slug];
      if (owned) {
        expect(photo).toMatchObject({ kind: "owned", src: owned.src, alt: owned.alt });
      } else {
        const registered = LANDMARK_PHOTOS[candidate.slug];
        expect(photo?.kind).toBe("curated");
        if (photo?.kind !== "curated") throw new Error(`Missing reviewed source for ${candidate.slug}`);
        expect(photo.src).toBe(curatedPhotoUrl(registered, 256));
        expect(photo.alt).toBe(registered.alt);
        expect(photo.photo).toBe(registered);
      }
    }
    expect(shownSlugs.sort()).toEqual(catalog.map(({ slug }) => slug).filter((slug) => approvedSlugs.has(slug)).sort());
    expect(freeSearchPlaceVisual({ slug: "unreviewed-place", google_photo_url: "https://images.example.com/coffee.jpg", google_photo_attribution: undefined })).toBeNull();
  });
});
