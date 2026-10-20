// @vitest-environment jsdom

import { act, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { mapListPhotoLoader } from "@/components/map/map-list-photo-loader";
import { curatedPhotoUrl, LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";

const actions = vi.hoisted(() => ({ openSheet: vi.fn(), save: vi.fn() }));
const imageLoads = vi.hoisted(() => new Map<string, ImgHTMLAttributes<HTMLImageElement>["onLoad"]>());
vi.mock("next/image", () => ({
  // A native image lets the mounted test deliver load/error without a network request.
  default: ({ src, alt, onLoad, onError, sizes }: ImgHTMLAttributes<HTMLImageElement>) => {
    if (typeof src !== "string") throw new Error("The media fixture requires an explicit image URL.");
    imageLoads.set(src, onLoad);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} sizes={sizes} onLoad={onLoad} onError={onError} />;
  },
}));
vi.mock("./PlaceSheetProvider", () => ({ usePlaceSheet: () => ({ openSheet: actions.openSheet }) }));
vi.mock("@/components/saved/SaveButton", () => ({
  default: ({ refType, refId, label }: { refType: string; refId: string; label: string }) =>
    <button type="button" data-save-ref={`${refType}:${refId}`} aria-label={label}
      onClick={() => actions.save(refType, refId)} />,
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
import PlaceCard from "./PlaceCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photoName = "places/test-place/photos/test-photo";
const googleSource = "https://www.google.com/maps/place/test/data=!3m1!1e3";
const place: PlaceCardData = {
  // An unowned, non-preferred landmark keeps Google → exact Commons coverage.
  slug: "francis-scott-key-grave-and-monument", name: "Francis Scott Key Grave and Monument",
  category: "park", city: "Frederick", address: "515 S Market St",
  state: "MD", postal_code: "21701", municipality: "frederick", is_verified: false,
  feature_score: 0, source: "manual", updated_at: "2026-09-01",
  source_id: "media-test:francis-scott-key", source_url: null,
  license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  geom: { lng: -77.4127627, lat: 39.4062196 },
  tags: [], short_blurb: "", open_status: { state: "unknown" },
  google_photo_url: `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`,
  google_photo_attribution: { photo_name: photoName, google_maps_uri: googleSource,
    authors: [{ display_name: "Photo contributor", uri: "https://www.google.com/maps/contrib/123" }] },
};

describe("PlaceCard selected media and credit", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    actions.openSheet.mockReset(); actions.save.mockReset(); imageLoads.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["photo-bytes"], { type: "image/jpeg" }), {
      headers: { "Content-Type": "image/jpeg" },
    })));
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:one-visible-photo");
      static revokeObjectURL = vi.fn();
    });
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(cardPlace = place, variant: "answer" | "feature" | "tile" | "grid" | "row" | "discovery" = "answer", nearby = false) {
    await act(async () => root.render(<PlaceCard place={cardPlace} variant={variant} showSource={false} discoverySurface={nearby ? "nearby" : undefined} />));
  }
  function photo() { return container.querySelector<HTMLImageElement>("[data-place-card-photo] img"); }
  function loadedCredit() { return container.querySelector('.place-card-photo-credit:not([aria-hidden="true"])'); }
  async function load(image: HTMLImageElement, width = 600, height = 400) {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
    await act(async () => image.dispatchEvent(new Event("load")));
  }
  async function fail(image: HTMLImageElement) { await act(async () => image.dispatchEvent(new Event("error"))); }

  it("keeps a Nearby place's address, honest hours, and independent actions after its real photo plan fails", async () => {
    const nearbyPlace = { ...place, slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt Architectural Museum",
      address: "1110 Rosemont Ave, Frederick, MD", google_photo_url: undefined, google_photo_attribution: undefined };
    await render(nearbyPlace, "discovery", true);
    const image = photo()!;
    expect(image.getAttribute("src")).toBe(LANDMARK_PHOTOS[nearbyPlace.slug].localSrc);
    await load(image);
    expect(loadedCredit()?.textContent).toContain(LANDMARK_PHOTOS[nearbyPlace.slug].author);
    expect(loadedCredit()?.closest("button")).toBeNull();
    await fail(image);
    expect(photo()).toBeNull();
    expect(loadedCredit()).toBeNull();
    expect(container.querySelector("article")?.dataset.placeCardSurface).toBe("nearby");
    expect(container.textContent).toContain(nearbyPlace.address);
    expect(container.textContent?.match(/Hours not confirmed/g)).toHaveLength(1);
    const open = container.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    const save = container.querySelector<HTMLButtonElement>("[data-save-ref]")!;
    const directions = container.querySelector<HTMLAnchorElement>('a[aria-label^="Directions to "]')!;
    expect(open.contains(save)).toBe(false);
    expect(open.contains(directions)).toBe(false);
    expect(directions.dataset.pressTarget).toBe("secondary");
    expect(directions.querySelector(":scope > [data-press-face]")).not.toBeNull();
    expect(directions.target).toBe("_blank");
    expect(directions.rel).toBe("noopener noreferrer");
    await act(async () => save.click());
    expect(actions.openSheet).not.toHaveBeenCalled();
    expect(actions.save).toHaveBeenCalledWith("place", nearbyPlace.slug);
    await act(async () => open.click());
    expect(actions.openSheet).toHaveBeenCalledWith(nearbyPlace, { returnFocus: open });
  });

  it("does not borrow the owned Creek image for a nearby place with a similar name", async () => {
    const promenade = { ...place, slug: "carroll-creek-promenade", name: "Carroll Creek Promenade",
      address: "38 S Market St", google_photo_url: undefined, google_photo_attribution: undefined };
    await render(promenade, "discovery", true);
    expect(photo()).toBeNull();
    expect(container.querySelector("article")?.dataset.placeCardHasPhoto).toBe("false");
    expect(container.textContent).toContain(promenade.name);
    expect(container.textContent).toContain(promenade.address);
    expect(container.querySelector('a[aria-label^="Directions to "]')?.getAttribute("href")).toMatch(/^https:\/\//);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(Object.entries(LANDMARK_PHOTOS))("uses the exact owned source first when present, then the existing curated file for %s", async (slug, metadata) => {
    const cardPlace = { ...place, slug,
      name: slug === "carroll-creek-linear-park-frederick" ? "Carroll Creek Linear Park" : place.name,
      google_photo_url: undefined, google_photo_attribution: undefined };
    await render(cardPlace);
    if (slug === "carroll-creek-linear-park-frederick") {
      const ownedImage = photo()!;
      expect(ownedImage.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
      expect(ownedImage.alt).toBe("Carroll Creek in Frederick.");
      expect(ownedImage.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("owned");
      expect(container.querySelector(".place-card-photo-credit")).toBeNull();
      await load(ownedImage);
      expect(photo()).toBe(ownedImage);
      expect(container.querySelector(".place-card-photo-credit")).toBeNull();
      await fail(ownedImage);
    }
    expect(photo()?.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("curated");
    expect(photo()?.getAttribute("src")).toBe(curatedPhotoUrl(metadata, 720));
    expect(photo()?.alt).toBe(metadata.alt);
    const pendingCredit = container.querySelector(".place-card-photo-credit")!;
    expect(loadedCredit()).toBeNull();
    expect(pendingCredit.getAttribute("aria-hidden")).toBe("true");
    expect(pendingCredit.hasAttribute("inert")).toBe(true);
    expect((pendingCredit as HTMLElement).style.visibility).toBe("hidden");
    const pendingLinks = pendingCredit.querySelectorAll("a").length;
    await load(photo()!);
    const credit = container.querySelector(".place-card-photo-credit")!;
    expect(credit).toBe(pendingCredit);
    expect(credit.hasAttribute("inert")).toBe(false);
    expect(credit.hasAttribute("aria-hidden")).toBe(false);
    expect(credit.querySelectorAll("a")).toHaveLength(pendingLinks);
    expect(credit.textContent).toContain(metadata.author);
    expect(credit.textContent).toContain(metadata.license);
    if (metadata.license === "CC BY 2.0") {
      expect(credit.querySelector('a[href="https://creativecommons.org/licenses/by/2.0"]')).not.toBeNull();
    }
    expect(credit.querySelector(`a[href="${metadata.source_url}"]`)).not.toBeNull();
    if (slug === "carroll-creek-linear-park-frederick") {
      await fail(photo()!);
      expect(photo()).toBeNull();
      expect(container.querySelector(".place-card-photo-credit")).toBeNull();
      expect(container.querySelector("h3")?.textContent).toBe(cardPlace.name);
      expect(container.querySelector('button[aria-label^="View "]')).not.toBeNull();
    }
  });

  it.each([
    ["schifferstadt-architectural-museum-frederick", "Schifferstadt Architectural Museum"],
    ["hessian-barracks-frederick-maryland", "Hessian Barracks Frederick Maryland"],
    ["co-canal-lock-30-brunswick", "C&O Canal Lock 30"],
    ["brewers-alley-frederick", "Brewer's Alley"],
  ])("keeps the exact local licensed %s photo and credit together through load and failure", async (slug, name) => {
    const metadata = LANDMARK_PHOTOS[slug];
    await render({ ...place, slug, name, google_photo_url: undefined, google_photo_attribution: undefined }, "discovery");
    const image = photo()!;
    expect(image.getAttribute("src")).toBe(metadata.localSrc);
    expect(image.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("curated");
    expect(loadedCredit()).toBeNull();
    await load(image);
    const credit = loadedCredit()!;
    expect(credit.textContent).toContain(metadata.author);
    expect(credit.textContent).toContain(metadata.modifications);
    expect(credit.querySelector(`a[href="${metadata.source_url}"]`)).not.toBeNull();
    expect(credit.querySelector(`a[href="${metadata.licenseUrl}"]`)?.textContent).toBe(metadata.license);
    expect(credit.closest("button")).toBeNull();
    await fail(image);
    expect(photo()).toBeNull();
    expect(loadedCredit()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe(name);
    expect(container.querySelector('button[aria-label^="View "]')).not.toBeNull();
    expect(container.querySelector('button[aria-label^="Save "]')).not.toBeNull();
    expect(container.querySelector('a[aria-label^="Directions to "]')).not.toBeNull();
    await load(image);
    expect(photo()).toBeNull();
    expect(loadedCredit()).toBeNull();
  });

  it.each(["feature", "answer", "grid", "tile", "row", "discovery"] as const)("keeps the %s card's loaded source, credit, and actions together through both failures", async (variant) => {
    await render(place, variant);
    const googleImage = photo()!;
    expect(googleImage.getAttribute("src")).toContain("fallback=signal");
    expect(loadedCredit()).toBeNull();
    await load(googleImage);
    expect(container.querySelector(".place-card-photo-credit")?.textContent).toContain("Photo contributor");
    expect(container.querySelector(`.place-card-photo-credit a[href="${googleSource}"]`)).not.toBeNull();
    await load(googleImage, 1, 1);
    const curatedImage = photo()!;
    expect(curatedImage).not.toBe(googleImage);
    expect(curatedImage.getAttribute("src")).toContain("Francis%20Scott%20Key%20Monument%20(March%202024).jpg");
    expect(loadedCredit()).toBeNull();
    // A detached old source cannot put its credit beside the new image.
    await load(googleImage);
    expect(loadedCredit()).toBeNull();
    await load(curatedImage);
    const credit = container.querySelector(".place-card-photo-credit")!;
    expect(credit.textContent).toContain("Engineerchange");
    expect(credit.textContent).toContain("CC BY-SA 4.0");
    expect(credit.textContent).not.toContain("Photo contributor");
    expect(credit.closest("button")).toBeNull();
    expect(credit.className).toContain("[&_a]:min-h-[44px]");
    expect(credit.className).toContain("[&_a]:min-w-[44px]");
    for (const link of credit.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\/(commons.wikimedia.org|creativecommons.org)\//);
    }
    await fail(curatedImage);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe(place.name);
    const open = container.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    await act(async () => open.click());
    expect(actions.openSheet).toHaveBeenCalledWith(place, { returnFocus: container.querySelector('button[aria-label^="View "]') });
    const save = container.querySelector<HTMLButtonElement>("[data-save-ref]");
    if (variant !== "grid") {
      expect(save?.getAttribute("data-save-ref")).toBe(`place:${place.slug}`);
      await act(async () => save!.click());
      expect(actions.save).toHaveBeenCalledWith("place", place.slug);
    }
  });

  it.each(["barbara-fritchie-house-frederick", "catoctin-furnace-thurmont"])("never substitutes the known unsuitable Google photo for preferred curated %s", async (slug) => {
    await render({ ...place, slug });
    if (LANDMARK_PHOTOS[slug].localSrc) expect(photo()?.getAttribute("src")).toBe(LANDMARK_PHOTOS[slug].localSrc);
    else expect(photo()?.getAttribute("src")).toContain(encodeURIComponent(LANDMARK_PHOTOS[slug].file));
    await fail(photo()!);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
  });

  it("collapses an unknown place's failed Google image without inventing a Commons match", async () => {
    await render({ ...place, slug: "beans-in-the-belfry-brunswick", name: "Beans in the Belfry" });
    await fail(photo()!);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Beans in the Belfry");
  });

  it("resets exhausted state and credit when the same mounted card receives a different place", async () => {
    await render(place);
    await fail(photo()!); await fail(photo()!);
    await render({ ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace" });
    expect(photo()?.getAttribute("src")).toContain("Catoctin%20Iron%20Furnace%20copy.jpg");
    expect(loadedCredit()).toBeNull();
    await load(photo()!);
    expect(container.querySelector(".place-card-photo-credit")?.textContent).toContain("G Wayne Rhodes");
  });

  it("does not let a captured old decode callback erase the new place's loaded credit", async () => {
    await render(place);
    const oldImage = photo()!;
    const oldLoad = imageLoads.get(oldImage.getAttribute("src")!)!;
    await load(oldImage);
    await render({ ...place, slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace" });
    await load(photo()!);
    expect(container.querySelector(".place-card-photo-credit")?.textContent).toContain("G Wayne Rhodes");
    await act(async () => oldLoad({ currentTarget: oldImage } as SyntheticEvent<HTMLImageElement>));
    expect(photo()?.getAttribute("src")).toContain("Catoctin%20Iron%20Furnace%20copy.jpg");
    expect(container.querySelector(".place-card-photo-credit")?.textContent).toContain("G Wayne Rhodes");
    expect(container.querySelector(".place-card-photo-credit")?.textContent).not.toContain("Photo contributor");
  });

  it("does not promote an uncredited Google image when exact photo metadata is missing", async () => {
    await render({ ...place, google_photo_attribution: undefined, google_maps_uri: googleSource });
    expect(photo()?.getAttribute("src")).toContain("Francis%20Scott%20Key%20Monument%20(March%202024).jpg");
    await load(photo()!);
    expect(loadedCredit()?.textContent).toContain("Engineerchange");
    expect(loadedCredit()?.textContent).not.toContain("Google Maps");
    await fail(photo()!);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
  });

  it("keeps a decoded image and its caption slot when exact same-photo attribution is updated", async () => {
    await render(place);
    const image = photo()!;
    await load(image);
    await render({ ...place, google_photo_attribution: { ...place.google_photo_attribution!, authors: [{ display_name: "Updated contributor" }] } });
    expect(photo()).toBe(image);
    expect(loadedCredit()?.textContent).toContain("Updated contributor");
    expect(loadedCredit()?.textContent).not.toContain("Photo contributor");
  });

  it("gives a row the exact owned photograph without an owner caption", async () => {
    await render({ ...place, slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
      google_photo_url: undefined, google_photo_attribution: undefined }, "row");
    expect(photo()?.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(photo()?.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("owned");
    await load(photo()!);
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Carroll Creek Linear Park");
  });

  it.each(["barbara-fritchie-house-frederick", "catoctin-furnace-thurmont"])("keeps unsuitable Google photos out of %s rows after curated failure", async (slug) => {
    await render({ ...place, slug }, "row");
    if (LANDMARK_PHOTOS[slug].localSrc) expect(photo()?.getAttribute("src")).toBe(LANDMARK_PHOTOS[slug].localSrc);
    else expect(photo()?.getAttribute("src")).toContain(encodeURIComponent(LANDMARK_PHOTOS[slug].file));
    await fail(photo()!);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
  });
  function lazyObserver() {
    const intersections: Array<() => void> = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        intersections.push(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
      }
      observe() {} disconnect() {} unobserve() {}
    });
    return intersections;
  }

  it("hydrates only a nearby row and keeps the exact photo credit through decoding", async () => {
    const intersections = lazyObserver();
    vi.spyOn(mapListPhotoLoader, "peekData").mockReturnValue(undefined);
    const hydrate = vi.spyOn(mapListPhotoLoader, "loadData").mockResolvedValue({
      google_photo_url: place.google_photo_url!, google_photo_attribution: place.google_photo_attribution,
    });
    const slimPlace = { ...place, slug: "beans-in-the-belfry-brunswick", name: "Beans in the Belfry", google_photo_url: undefined, google_photo_attribution: undefined };
    await act(async () => root.render(<PlaceCard place={slimPlace} variant="row" lazyPhoto />));
    expect(photo()).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();
    await act(async () => intersections.at(-1)!());
    expect(hydrate).toHaveBeenCalledExactlyOnceWith(slimPlace.slug);
    expect(photo()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    // Metadata proximity is not permission to request paid photo bytes.
    await act(async () => intersections.at(-1)!());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("w=176");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("fallback=signal");
    const image = photo()!;
    expect(image.getAttribute("src")).toBe("blob:one-visible-photo");
    expect(loadedCredit()).toBeNull();
    await load(image);
    expect(loadedCredit()?.textContent).toContain("Photo contributor");
    expect(loadedCredit()?.querySelector(`a[href="${googleSource}"]`)).not.toBeNull();
    expect(loadedCredit()?.closest("button")).toBeNull();
    await load(image, 1, 1);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("never shows an old row's delayed hydration for the newly selected place", async () => {
    const intersections = lazyObserver();
    vi.spyOn(mapListPhotoLoader, "peekData").mockReturnValue(undefined);
    let finishOld!: (photo: { google_photo_url: string; google_photo_attribution: typeof place.google_photo_attribution }) => void;
    const hydrate = vi.spyOn(mapListPhotoLoader, "loadData")
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(null);
    const slimPlace = { ...place, slug: "first-place", google_photo_url: undefined, google_photo_attribution: undefined };
    await act(async () => root.render(<PlaceCard place={slimPlace} variant="row" lazyPhoto />));
    await act(async () => intersections.at(-1)!());
    await act(async () => root.render(<PlaceCard place={{ ...slimPlace, slug: "next-place", name: "Next place" }} variant="row" lazyPhoto />));
    expect(photo()).toBeNull();
    await act(async () => finishOld({ google_photo_url: place.google_photo_url!, google_photo_attribution: place.google_photo_attribution }));
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await act(async () => intersections.at(-1)!());
    expect(hydrate).toHaveBeenLastCalledWith("next-place");
    expect(container.querySelector("h3")?.textContent).toBe("Next place");
  });

  it("uses reviewed lazy-row sources without a metadata request, including after failure", async () => {
    lazyObserver();
    const hydrate = vi.spyOn(mapListPhotoLoader, "loadData");
    await act(async () => root.render(<PlaceCard place={{ ...place, slug: "carroll-creek-linear-park-frederick", google_photo_url: undefined, google_photo_attribution: undefined }} variant="row" lazyPhoto />));
    expect(photo()?.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("owned");
    await fail(photo()!);
    expect(photo()?.closest("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("curated");
    await fail(photo()!);
    expect(photo()).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("rejects a hydrated photo whose credit belongs to a different image", async () => {
    const intersections = lazyObserver();
    vi.spyOn(mapListPhotoLoader, "peekData").mockReturnValue(undefined);
    vi.spyOn(mapListPhotoLoader, "loadData").mockResolvedValue({ google_photo_url: place.google_photo_url!,
      google_photo_attribution: { ...place.google_photo_attribution!, photo_name: "places/other/photos/another" } });
    await act(async () => root.render(<PlaceCard place={{ ...place, slug: "unregistered-place", google_photo_url: undefined, google_photo_attribution: undefined }} variant="row" lazyPhoto />));
    await act(async () => intersections.at(-1)!());
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
  });

  it("gives discovery the exact owned full-width photo with independent real actions", async () => {
    const owned = { ...place, slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park",
      google_photo_url: undefined, google_photo_attribution: undefined };
    await render(owned, "discovery");
    expect(photo()?.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(photo()?.getAttribute("sizes")).toBe("(max-width: 640px) calc(100vw - 32px), 600px");
    expect(container.querySelector('article[data-place-card-has-photo="true"]')).not.toBeNull();
    await load(photo()!);
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    const open = container.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    const save = container.querySelector<HTMLButtonElement>("[data-save-ref]")!;
    const directions = container.querySelector<HTMLAnchorElement>('a[aria-label^="Directions to "]')!;
    expect(directions.getAttribute("href")).toBe(`https://www.google.com/maps/dir/?api=1&destination=${owned.geom.lat},${owned.geom.lng}`);
    expect(directions.target).toBe("_blank");
    expect(directions.rel).toContain("noopener");
    expect(save.closest('button[aria-label^="View "]')).toBeNull();
    expect(directions.closest("button")).toBeNull();
    await act(async () => save.click());
    expect(actions.save).toHaveBeenCalledWith("place", owned.slug);
    expect(actions.openSheet).not.toHaveBeenCalled();
    await act(async () => open.click());
    expect(document.activeElement).not.toBe(open);
    expect(actions.openSheet).toHaveBeenCalledWith(owned, { returnFocus: open });
  });

  it("keeps a missing discovery visual compact with one quiet unknown-hours line", async () => {
    await render({ ...place, slug: "unregistered-place", google_photo_url: undefined, google_photo_attribution: undefined,
      field_note_tip: "A supplied detail that stays off the compact fallback.", known_for: [place.name] }, "discovery");
    expect(photo()).toBeNull();
    expect(container.querySelector("[data-place-card-photo]")).toBeNull();
    expect(container.querySelector('article[data-place-card-has-photo="false"]')).not.toBeNull();
    expect(container.textContent?.match(/Hours not confirmed/g)).toHaveLength(1);
    expect(container.querySelector("h3")?.textContent).toBe(place.name);
    expect(container.textContent).not.toContain("A supplied detail");
    expect(container.querySelector('[data-save-ref="place:unregistered-place"]')).not.toBeNull();
    expect(container.querySelector('a[aria-label^="Directions to "]')).not.toBeNull();
  });

  it("shows the actual confirmed status and only one supplied discovery fact", async () => {
    const fact = "The entrance is beside the garden on Market Street.";
    await render({ ...place, slug: "carroll-creek-linear-park-frederick", google_photo_url: undefined, google_photo_attribution: undefined,
      open_status: { state: "closed" }, field_note_tip: fact,
      known_for: ["A second fact that should stay on the detail page."] }, "discovery");
    expect(container.textContent).toContain("Closed");
    expect(container.textContent).not.toContain("Hours not confirmed");
    expect(container.textContent).toContain(fact);
    expect(container.textContent).not.toContain("A second fact");
    expect(container.querySelector('[aria-label="Reasons this is shown"]')).toBeNull();
  });

  it("keeps discovery attribution bound to the selected image and outside all actions", async () => {
    await render(place, "discovery");
    const first = photo()!;
    await load(first);
    expect(loadedCredit()?.textContent).toContain("Photo contributor");
    for (const link of loadedCredit()!.querySelectorAll("a")) expect(link.closest("button")).toBeNull();
    await fail(first);
    expect(loadedCredit()).toBeNull();
    await load(photo()!);
    expect(loadedCredit()?.textContent).toContain("Engineerchange");
    expect(loadedCredit()?.textContent).not.toContain("Photo contributor");
    await fail(photo()!);
    expect(container.querySelector("[data-place-card-photo]")).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector('[data-save-ref]')).not.toBeNull();
    expect(container.querySelector('a[aria-label^="Directions to "]')).not.toBeNull();
  });

  it("observes the whole discovery card before using the existing lazy metadata loader", async () => {
    const observe = vi.fn();
    let enterViewport: (() => void) | undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        enterViewport = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      }
      observe = observe;
      disconnect() {}
    });
    vi.spyOn(mapListPhotoLoader, "peekData").mockReturnValue(undefined);
    const hydrate = vi.spyOn(mapListPhotoLoader, "loadData").mockResolvedValue({
      google_photo_url: place.google_photo_url!, google_photo_attribution: place.google_photo_attribution,
    });
    const slim = { ...place, slug: "unregistered-place", google_photo_url: undefined, google_photo_attribution: undefined };
    await act(async () => root.render(<PlaceCard place={slim} variant="discovery" lazyPhoto />));
    expect(observe).toHaveBeenCalledWith(container.querySelector("article"));
    expect(hydrate).not.toHaveBeenCalled();
    expect(photo()).toBeNull();
    await act(async () => enterViewport!());
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledWith(slim.slug);
    expect(photo()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => enterViewport!());
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("w=720");
    expect(photo()?.getAttribute("src")).toBe("blob:one-visible-photo");
    expect(loadedCredit()).toBeNull();
    await load(photo()!);
    expect(loadedCredit()?.textContent).toContain("Photo contributor");
  });

  it("removes a capped discovery image and credit while keeping the actual place and actions", async () => {
    const intersections = lazyObserver();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("fallback-signal", {
      headers: { "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap" },
    })));
    const cardPlace = { ...place, slug: "unregistered-place", name: "Actual venue" };
    await act(async () => root.render(<PlaceCard place={cardPlace} variant="discovery" lazyPhoto />));
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => intersections.at(-1)!());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(photo()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector('article[data-place-card-has-photo="false"]')).not.toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Actual venue");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const opener = container.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    await act(async () => opener.click());
    expect(actions.openSheet).toHaveBeenCalledWith(cardPlace, { returnFocus: opener });
    await act(async () => container.querySelector<HTMLButtonElement>("[data-save-ref]")!.click());
    expect(actions.save).toHaveBeenCalledWith("place", cardPlace.slug);
  });

  it.each(["feature", "answer", "tile", "row", "discovery"] as const)("keeps %s Save and credit actions outside the primary press owner", async variant => {
    await render(place, variant);
    await load(photo()!);
    const opener = container.querySelector<HTMLButtonElement>('button[aria-label^="View "]')!;
    const save = container.querySelector<HTMLButtonElement>("[data-save-ref]")!;
    expect(opener.getAttribute("data-press-target")).toBe("card");
    expect(opener.querySelectorAll(":scope > [data-press-face]")).toHaveLength(1);
    expect(opener.contains(save)).toBe(false);
    expect(opener.contains(loadedCredit())).toBe(false);
    await act(async () => save.click());
    expect(actions.save).toHaveBeenCalledWith("place", place.slug);
    expect(actions.openSheet).not.toHaveBeenCalled();
    await act(async () => opener.click());
    expect(actions.openSheet).toHaveBeenCalledOnce();
    expect(actions.openSheet).toHaveBeenCalledWith(place, { returnFocus: opener });
  });

});
