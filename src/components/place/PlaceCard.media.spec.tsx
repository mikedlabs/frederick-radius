// @vitest-environment jsdom

import { act, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";

const actions = vi.hoisted(() => ({ openSheet: vi.fn(), save: vi.fn() }));
const imageLoads = vi.hoisted(() => new Map<string, ImgHTMLAttributes<HTMLImageElement>["onLoad"]>());
vi.mock("next/image", () => ({
  // A native image lets the mounted test deliver load/error without a network request.
  default: ({ src, alt, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) => {
    if (typeof src !== "string") throw new Error("The media fixture requires an explicit image URL.");
    imageLoads.set(src, onLoad);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} onLoad={onLoad} onError={onError} />;
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
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(cardPlace = place, variant: "answer" | "feature" | "tile" | "grid" | "row" = "answer") {
    await act(async () => root.render(<PlaceCard place={cardPlace} variant={variant} showSource={false} />));
  }
  function photo() { return container.querySelector<HTMLImageElement>("[data-place-card-photo] img"); }
  function loadedCredit() { return container.querySelector('.place-card-photo-credit:not([aria-hidden="true"])'); }
  async function load(image: HTMLImageElement, width = 600, height = 400) {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
    await act(async () => image.dispatchEvent(new Event("load")));
  }
  async function fail(image: HTMLImageElement) { await act(async () => image.dispatchEvent(new Event("error"))); }

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
    expect(photo()?.getAttribute("src")).toContain(encodeURIComponent(metadata.file));
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
    expect(credit.querySelector(`a[href="${metadata.source_url}"]`)).not.toBeNull();
    if (slug === "carroll-creek-linear-park-frederick") {
      await fail(photo()!);
      expect(photo()).toBeNull();
      expect(container.querySelector(".place-card-photo-credit")).toBeNull();
      expect(container.querySelector("h3")?.textContent).toBe(cardPlace.name);
      expect(container.querySelector('button[aria-label^="View "]')).not.toBeNull();
    }
  });

  it.each(["feature", "answer", "grid", "tile"] as const)("keeps the %s card's loaded source, credit, and actions together through both failures", async (variant) => {
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
    expect(actions.openSheet).toHaveBeenCalledWith(place);
    const save = container.querySelector<HTMLButtonElement>("[data-save-ref]");
    if (variant !== "grid") {
      expect(save?.getAttribute("data-save-ref")).toBe(`place:${place.slug}`);
      await act(async () => save!.click());
      expect(actions.save).toHaveBeenCalledWith("place", place.slug);
    }
  });

  it.each(["barbara-fritchie-house-frederick", "catoctin-furnace-thurmont"])("never substitutes the known unsuitable Google photo for preferred curated %s", async (slug) => {
    await render({ ...place, slug });
    expect(photo()?.getAttribute("src")).toContain(encodeURIComponent(LANDMARK_PHOTOS[slug].file));
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

  it("leaves the dense row projection outside curated card imagery", async () => {
    await render({ ...place, google_photo_url: undefined, google_photo_attribution: undefined }, "row");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
  });
});
