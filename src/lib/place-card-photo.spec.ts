import { describe, expect, it } from "vitest";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";
import { getOwnedPlacePhoto } from "./owned-place-photos";
import { isPlacePhotoFailureSignal, placePhotoFailureSignalSrc, placeCardPhotoPlan, placePhotoGallerySources, recordPlaceCardPhotoResult, selectedPlaceCardPhoto } from "./place-card-photo";

const name = "places/monument/photos/canonical";
const place = {
  slug: "francis-scott-key-grave-and-monument",
  google_photo_url: `/api/place-photo?name=${encodeURIComponent(name)}&w=800`,
  google_photo_attribution: { photo_name: name,
    google_maps_uri: "https://www.google.com/maps/place/Francis+Scott+Key+Monument/data=!3m1!1e3", authors: [] },
};

describe("place card photo source contract", () => {
  it("prefers the canonical individually attributable Google photo and requests a bounded failure signal", () => {
    const source = selectedPlaceCardPhoto(placeCardPhotoPlan(place, 180), null)!;
    expect(source.kind).toBe("google");
    const url = new URL(source.src, "https://frederickradius.app");
    expect(url.searchParams.get("name")).toBe(name);
    expect(url.searchParams.get("w")).toBe("360");
    expect(url.searchParams.get("fallback")).toBe("signal");
  });

  it.each([
    undefined,
    { ...place.google_photo_attribution, photo_name: "places/somewhere-else/photos/mismatch" },
    { ...place.google_photo_attribution, google_maps_uri: "https://www.google.com/maps/place/?q=Francis+Scott+Key+Monument" },
  ])("does not treat a missing, mismatched, or generic source record as publishable Google imagery", (attribution) => {
    const source = selectedPlaceCardPhoto(placeCardPhotoPlan({ ...place, google_photo_attribution: attribution }, 360), null);
    expect(source?.kind).toBe("curated");
  });

  it.each([undefined, "https://example.com/a-scenic-image.jpg", "https://places.googleapis.com/photo?key=not-used"])("has no photo substitution for an unknown slug", (url) => {
    expect(selectedPlaceCardPhoto(placeCardPhotoPlan({ slug: "beans-in-the-belfry-brunswick", google_photo_url: url }, 360), null)).toBeNull();
  });

  it("tries the exact curated image once after Google failure, then remains exhausted despite late load/error events", () => {
    const plan = placeCardPhotoPlan(place, 360);
    const google = selectedPlaceCardPhoto(plan, null)!;
    let state = recordPlaceCardPhotoResult(plan, null, google.src, "failed");
    const curated = selectedPlaceCardPhoto(plan, state)!;
    expect(curated.kind).toBe("curated");
    expect(curated.src).toContain("Francis%20Scott%20Key%20Monument%20(March%202024).jpg");
    state = recordPlaceCardPhotoResult(plan, state, google.src, "loaded");
    expect(state.loadedSrc).toBeNull();
    state = recordPlaceCardPhotoResult(plan, state, curated.src, "failed");
    state = recordPlaceCardPhotoResult(plan, state, curated.src, "failed");
    state = recordPlaceCardPhotoResult(plan, state, google.src, "loaded");
    expect(state.failedSources).toHaveLength(2);
    expect(state.loadedSrc).toBeNull();
    expect(selectedPlaceCardPhoto(plan, state)).toBeNull();
  });

  it("does not fall back to an unsuitable Google image after a preferred landmark photo fails", () => {
    const plan = placeCardPhotoPlan({ ...place, slug: "catoctin-furnace-thurmont" }, 244);
    const source = selectedPlaceCardPhoto(plan, null)!;
    expect(source.kind).toBe("curated");
    expect(selectedPlaceCardPhoto(plan, recordPlaceCardPhotoResult(plan, null, source.src, "failed"))).toBeNull();
  });

  it("keeps an existing owned image separate from Google attribution", () => {
    const source = selectedPlaceCardPhoto(placeCardPhotoPlan({ slug: "a-place", google_photo_url: "/images/real-owned-photo.jpg" }, 360), null);
    expect(source?.kind).toBe("owned");
  });
});


describe("new exact destination fallback continuity", () => {
  it.each([
    ["francis-scott-key-grave-and-monument", "Engineerchange"],
    ["rose-hill-manor-park-museums-frederick", "LittleLuckyMd"],
    ["historic-utica-covered-bridge-thurmont", "Acroterion"],
  ])("retains Google priority and credited bounded fallback for %s", (slug, author) => {
    const photoName = `places/${slug}/photos/approved`;
    const plan = placeCardPhotoPlan({
      slug,
      google_photo_url: `/api/place-photo?slug=${slug}&name=${encodeURIComponent(photoName)}`,
      google_photo_attribution: {
        photo_name: photoName,
        google_maps_uri: `https://www.google.com/maps/place/${slug}/data=!3m1!1e3`,
        authors: [],
      },
    }, 180);
    const google = selectedPlaceCardPhoto(plan, null)!;
    expect(google.kind).toBe("google");
    const state = recordPlaceCardPhotoResult(plan, null, google.src, "failed");
    const fallback = selectedPlaceCardPhoto(plan, state)!;
    expect(fallback.kind).toBe("curated");
    if (fallback.kind !== "curated") throw new Error("Expected exact destination fallback");
    expect(fallback.photo.author).toBe(author);
    expect(fallback.photo.license).toBe("CC BY-SA 4.0");
    expect(fallback.photo.source_url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(new URL(fallback.src).searchParams.get("width")).toBe("360");
    const exhausted = recordPlaceCardPhotoResult(plan, state, fallback.src, "failed");
    expect(selectedPlaceCardPhoto(plan, exhausted)).toBeNull();
    expect(recordPlaceCardPhotoResult(plan, exhausted, google.src, "loaded")).toEqual(exhausted);
  });
});


describe("exact owned place photo continuity", () => {
  const slug = "carroll-creek-linear-park-frederick";
  const src = "/images/seasons/summer/SUMMER CARROL CREEK.jpg";

  it("uses the verified Creek photo without any Google data or invented credit", () => {
    const input = { slug };
    const source = selectedPlaceCardPhoto(placeCardPhotoPlan(input, 360), null);
    expect(source).toMatchObject({ kind: "owned", src, alt: "Carroll Creek in Frederick." });
    expect(source).not.toHaveProperty("attribution");
    expect(input).toEqual({ slug });
  });

  it.each(["beans-in-the-belfry-brunswick", "town:frederick", "frederick", "__proto__"])("does not assign the scene to another identity: %s", (otherSlug) => {
    expect(getOwnedPlacePhoto(otherSlug)).toBeNull();
    expect(placeCardPhotoPlan({ slug: otherSlug }, 360).sources).toEqual([]);
  });

  it("retains original source gates after owned failure and exhausts each source once", () => {
    const plan = placeCardPhotoPlan({ ...place, slug }, 360);
    expect(plan.sources.map((source) => source.kind)).toEqual(["owned", "google", "curated"]);
    let state = recordPlaceCardPhotoResult(plan, null, src, "failed");
    expect(selectedPlaceCardPhoto(plan, state)?.kind).toBe("google");
    state = recordPlaceCardPhotoResult(plan, state, src, "loaded");
    expect(state.loadedSrc).toBeNull();
    for (const source of plan.sources.slice(1)) state = recordPlaceCardPhotoResult(plan, state, source.src, "failed");
    expect(selectedPlaceCardPhoto(plan, state)).toBeNull();
    const exhausted = state;
    state = recordPlaceCardPhotoResult(plan, state, src, "loaded");
    expect(state).toEqual(exhausted);
    expect(state.failedSources).toHaveLength(3);
  });

  it("carries explicit source records through the gallery without duplicating the hero or accepting uncredited providers", () => {
    const extraName = "places/monument/photos/extra";
    const extraUrl = `/api/place-photo?name=${encodeURIComponent(extraName)}&w=800`;
    const sources = placePhotoGallerySources({ ...place, slug,
      google_photos: [place.google_photo_url, place.google_photo_url.replace("w=800", "w=600"), extraUrl, "https://example.com/scenery.jpg"],
      google_photo_attributions: [{ ...place.google_photo_attribution, photo_name: extraName }],
    }, 360);
    expect(sources[0]).toMatchObject({ kind: "owned", src });
    expect(sources.filter((source) => source.kind === "google").map((source) => source.attribution.photo_name))
      .toEqual([name, extraName]);
    expect(sources.filter((source) => source.src === src)).toHaveLength(1);
    expect(sources.some((source) => source.src.includes("example.com"))).toBe(false);
    expect(placePhotoGallerySources({ slug, google_photos: [extraUrl] }, 360)
      .some((source) => source.kind === "google")).toBe(false);
  });

  it("keeps the known unsuitable hero out of the gallery at a different requested width", () => {
    const sources = placePhotoGallerySources({ ...place, slug: "catoctin-furnace-thurmont",
      google_photos: [place.google_photo_url.replace("w=800", "w=1200")],
    }, 360);
    expect(sources.map((source) => source.kind)).toEqual(["curated"]);
  });
});


describe("reviewed owned Baker Park photograph", () => {
  it.each(["baker-park-frederick", "baker-park-bandshell"])("uses the exact park photograph before eligible provider media for %s", (slug) => {
    const input = { ...place, slug };
    const plan = placeCardPhotoPlan(input, 360);
    const owned = selectedPlaceCardPhoto(plan, null)!;
    expect(owned).toMatchObject({ kind: "owned", src: "/images/seasons/fall/018.jpg",
      width: 1920, height: 1079, objectPosition: "right" });
    expect(owned.alt).toContain(slug === "baker-park-bandshell" ? "Baker Park Bandshell" : "Baker Park");
    expect(owned).not.toHaveProperty("attribution");
    expect(owned).not.toHaveProperty("photo");
    expect(plan.sources.map(source => source.kind)).toEqual(slug === "baker-park-frederick"
      ? ["owned", "google", "curated"] : ["owned", "google"]);
    let state = recordPlaceCardPhotoResult(plan, null, owned.src, "failed");
    expect(selectedPlaceCardPhoto(plan, state)?.kind).toBe("google");
    expect(recordPlaceCardPhotoResult(plan, state, owned.src, "loaded")).toEqual(state);
    for (const source of plan.sources.slice(1)) state = recordPlaceCardPhotoResult(plan, state, source.src, "failed");
    expect(selectedPlaceCardPhoto(plan, state)).toBeNull();
    expect(state.failedSources).toHaveLength(plan.sources.length);
    expect(recordPlaceCardPhotoResult(plan, state, owned.src, "loaded")).toEqual(state);
    expect(placePhotoGallerySources(input, 360)[0]).toEqual(owned);
  });
});


describe("shared media failure signal", () => {
  it("signals only the existing same-origin photo proxy and preserves source identity", () => {
    const src = placePhotoFailureSignalSrc(place.google_photo_url);
    const url = new URL(src, "https://frederickradius.app");
    expect(url.searchParams.get("name")).toBe(name);
    expect(url.searchParams.get("fallback")).toBe("signal");
    expect(placePhotoFailureSignalSrc("/images/seasons/summer/SUMMER CARROL CREEK.jpg"))
      .toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(placePhotoFailureSignalSrc("https://commons.wikimedia.org/photo.jpg"))
      .toBe("https://commons.wikimedia.org/photo.jpg");
  });

  it.each([
    { naturalWidth: 1, naturalHeight: 1 },
    { naturalWidth: 1, naturalHeight: 800 },
    { naturalWidth: 1200, naturalHeight: 1 },
  ])("does not accept a transparent or degenerate signal as a loaded photo: %j", (image) => {
    expect(isPlacePhotoFailureSignal(image)).toBe(true);
  });

  it("accepts a decoded two-dimensional photograph", () => {
    expect(isPlacePhotoFailureSignal({ naturalWidth: 1200, naturalHeight: 800 })).toBe(false);
  });
});


describe("existing licensed local place photographs", () => {
  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS))("uses exact local bytes with the existing credit for %s at every consumer width", (slug, { image }) => {
    for (const width of [88, 128, 360, 1200]) {
      const plan = placeCardPhotoPlan({ slug }, width);
      expect(plan.sources).toHaveLength(1);
      expect(plan.sources[0]).toMatchObject({ kind: "curated", src: image.src, alt: image.alt,
        photo: { author: image.creator, source_url: image.source_url, license: image.license.label,
          licenseUrl: image.license.url, modifications: image.modifications } });
      expect(getOwnedPlacePhoto(slug)).toBeNull();
      expect(placePhotoGallerySources({ slug }, width)).toEqual(plan.sources);
    }
  });

  it.each(Object.entries(CREDITED_LOCAL_PLACE_PHOTOS).filter(([slug]) => !LANDMARK_PHOTOS[slug]?.preferCurated))("prefers reviewed bundled %s bytes over eligible Google and retains its exact fallback", (slug, { image }) => {
    const input = { ...place, slug };
    for (const width of [88, 128, 360, 1200]) {
      const plan = placeCardPhotoPlan(input, width);
      expect(LANDMARK_PHOTOS[slug].preferLocal).toBe(true);
      expect(plan.sources.map(source => source.kind)).toEqual(["curated", "google"]);
      const local = selectedPlaceCardPhoto(plan, null)!;
      expect(local).toMatchObject({ kind: "curated", src: image.src, alt: image.alt,
        photo: { author: image.creator, source_url: image.source_url,
          license: image.license.label, licenseUrl: image.license.url, modifications: image.modifications } });
      expect(placePhotoGallerySources(input, width)[0]).toEqual(local);
      const failed = recordPlaceCardPhotoResult(plan, null, local.src, "failed");
      const google = selectedPlaceCardPhoto(plan, failed)!;
      expect(google.kind).toBe("google");
      if (google.kind !== "google") throw new Error("Expected the existing individually credited fallback.");
      expect(google.attribution).toEqual(place.google_photo_attribution);
      expect(recordPlaceCardPhotoResult(plan, failed, local.src, "loaded")).toEqual(failed);
      const exhausted = recordPlaceCardPhotoResult(plan, failed, google.src, "failed");
      expect(selectedPlaceCardPhoto(plan, exhausted)).toBeNull();
      expect(exhausted.failedSources).toHaveLength(2);
      expect(recordPlaceCardPhotoResult(plan, exhausted, local.src, "loaded")).toEqual(exhausted);
      expect(placeCardPhotoPlan({ slug, google_photo_url: place.google_photo_url }, width).sources.map(source => source.kind))
        .toEqual(["curated"]);
    }
  });

  it.each(["city-hall-8", "mount-st-marys-university-emmitsburg"] as const)("uses the reviewed local %s photo before requesting a provider fallback", (slug) => {
    const plan = placeCardPhotoPlan({ ...place, slug }, 360);
    expect(plan.sources.map((source) => source.kind)).toEqual(["curated", "google"]);
    expect(selectedPlaceCardPhoto(plan, null)?.src).toBe(CREDITED_LOCAL_PLACE_PHOTOS[slug].image.src);
    const failed = recordPlaceCardPhotoResult(plan, null, plan.sources[0].src, "failed");
    expect(selectedPlaceCardPhoto(plan, failed)?.kind).toBe("google");
    expect(LANDMARK_PHOTOS[slug].preferCurated).toBeUndefined();
  });

  it("keeps the reviewed Barbara Fritchie photograph ahead of the misidentified provider image", () => {
    const slug = "barbara-fritchie-house-frederick";
    const plan = placeCardPhotoPlan({ ...place, slug }, 360);
    expect(plan.sources.map((source) => source.kind)).toEqual(["curated"]);
    expect(selectedPlaceCardPhoto(plan, null)?.src).toBe(CREDITED_LOCAL_PLACE_PHOTOS[slug].image.src);
    expect(plan.sources[0]).toMatchObject({ photo: { author: "Preservation Maryland", license: "CC BY-SA 2.0" } });
    const failed = recordPlaceCardPhotoResult(plan, null, plan.sources[0].src, "failed");
    expect(selectedPlaceCardPhoto(plan, failed)).toBeNull();
  });

  it.each(["schifferstadt", "hessian-barracks", "co-canal", "brunswick", "town:frederick", "__proto__"])("does not broaden exact-place imagery to a history, town or inherited identity: %s", (slug) => {
    expect(placeCardPhotoPlan({ slug }, 360).sources).toEqual([]);
  });
});


describe("reviewed owned carillon photograph", () => {
  it("keeps the exact carillon ahead of eligible Google, with a bounded fallback and detail gallery identity", () => {
    const slug = "joseph-dill-baker-memorial-carillon-bell-tower";
    const input = { ...place, slug };
    const plan = placeCardPhotoPlan(input, 360);
    const owned = selectedPlaceCardPhoto(plan, null)!;
    expect(owned).toMatchObject({ kind: "owned", src: "/images/seasons/fall/021.jpg",
      width: 1920, height: 1279, objectPosition: "left" });
    expect(owned.alt).toBe("The Joseph Dill Baker Memorial Carillon in Baker Park, Frederick.");
    expect(owned).not.toHaveProperty("photo");
    expect(owned).not.toHaveProperty("attribution");
    expect(placePhotoGallerySources(input, 360)[0]).toEqual(owned);
    expect(plan.sources.map(source => source.kind)).toEqual(["owned", "google"]);
    const failed = recordPlaceCardPhotoResult(plan, null, owned.src, "failed");
    expect(selectedPlaceCardPhoto(plan, failed)?.kind).toBe("google");
    expect(recordPlaceCardPhotoResult(plan, failed, owned.src, "loaded")).toEqual(failed);
    const exhausted = recordPlaceCardPhotoResult(plan, failed, plan.sources[1].src, "failed");
    expect(selectedPlaceCardPhoto(plan, exhausted)).toBeNull();
    expect(getOwnedPlacePhoto("bell-tower-baker-park")).toBeNull();
  });
});
