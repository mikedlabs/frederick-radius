// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import type { PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { PlaceCardPhotoCredit } from "./PlaceCardPhoto";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const photo = getLandmarkPhoto("sabor-de-cuba-restaurant-frederick")!;
const source: PlaceCardPhotoSource = { kind: "curated", src: photo.localSrc!, alt: photo.alt, photo };

describe("short reviewed photo credit line", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(selected: PlaceCardPhotoSource = source, loaded = true) {
    await act(async () => root.render(<PlaceCardPhotoCredit source={selected} loaded={loaded} touchTarget />));
  }
  const line = () => container.querySelector<HTMLElement>("[data-photo-credit-text]")!;

  it("prints author, capture year, license and source as one visible line without the change record", async () => {
    await render();
    expect(line().textContent).toBe("Bohemian Baltimore · 2018 · CC BY-SA 4.0 · Wikimedia Commons · edited");
    expect(line().closest("details, a, button, [hidden], [inert], [aria-hidden='true']")).toBeNull();
    expect(getComputedStyle(line()).visibility).toBe("visible");
    expect(container.querySelector(`a[href="${photo.licenseUrl}"]`)?.textContent).toBe(photo.license);
    expect(container.querySelector(`a[href="${photo.source_url}"]`)?.textContent).toBe("Wikimedia Commons");
    // The stored file is Wikimedia's resized 1,280 px rendition, so it says so.
    expect(container.querySelector("[data-photo-credit-edited]")?.textContent).toBe("edited");
    expect(container.textContent).not.toContain(photo.modifications);
    expect(container.querySelector("details, summary, [data-photo-reference]")).toBeNull();
    expect(container.querySelector(".sr-only")?.textContent).toBe("Photo by ");
  });

  it("keeps every credit link underlined with a 44px target", async () => {
    await render();
    const links = [...container.querySelectorAll<HTMLAnchorElement>("[data-photo-credit-line] a")];
    expect(links).toHaveLength(2);
    const lineClass = container.querySelector("[data-photo-credit-line]")!.className;
    for (const rule of ["[&_a]:underline", "[&_a]:min-h-11", "[&_a]:min-w-11"]) expect(lineClass).toContain(rule);
    for (const link of links) expect(link.target).toBe("_blank");
  });

  it("marks an edited file and keeps Brewer's Alley original photograph link", async () => {
    const brewer = getLandmarkPhoto("brewers-alley-frederick")!;
    await render({ kind: "curated", src: brewer.localSrc!, alt: brewer.alt, photo: brewer });
    expect(line().textContent).toBe("Stacy (Rambling Traveler) · 2004 · CC BY-SA 2.0 · Wikimedia Commons · Original photograph");
    expect(container.querySelector(`a[href="${brewer.originalSourceUrl}"]`)?.textContent).toBe("Original photograph");
    expect(container.textContent).not.toContain("October 26, 2004");
    const furnace = getLandmarkPhoto("catoctin-furnace-thurmont")!;
    await render({ kind: "curated", src: furnace.localSrc!, alt: furnace.alt, photo: furnace });
    expect(line().textContent).toBe("G Wayne Rhodes · CC BY-SA 4.0 · Wikimedia Commons · edited");
    expect(container.querySelector("[data-photo-credit-line]")?.hasAttribute("data-photo-edited")).toBe(true);
    expect(container.textContent).not.toContain(furnace.modifications);
  });

  it("keeps the entire pending credit hidden and inert until decoded", async () => {
    await render(source, false); const credit = container.querySelector<HTMLElement>(".place-card-photo-credit")!;
    expect(credit.hasAttribute("inert")).toBe(true); expect(credit.getAttribute("aria-hidden")).toBe("true");
    expect(credit.style.visibility).toBe("hidden");
    expect(line().closest("[inert]")).toBe(credit);
  });

  it("leaves unknown and invalid dates out of the line while preserving provenance", async () => {
    const county = getLandmarkPhoto("ballenger-creek-park-frederick")!;
    await render({ kind: "curated", src: county.localSrc!, alt: county.alt, photo: county });
    expect(line().textContent).toBe("Frederick County Parks & Recreation · Used with permission · Frederick County · edited");
    expect(container.querySelector(".sr-only")?.textContent).toBe("Photo provided by ");
    expect(container.textContent).not.toContain("Photo capture date unknown");
    await render({ ...source, photo: { ...photo, capturedOn: "2023-02-29" } });
    expect(container.querySelector("[data-photo-credit-year]")).toBeNull();
    expect(line().textContent).toBe("Bohemian Baltimore · CC BY-SA 4.0 · Wikimedia Commons · edited");
  });

  it.each(["zoes-chocolate-company", "visitation-hotel"])("shows only the unverified appearance context for %s", async slug => {
    await render(getOwnedPlacePhoto(slug)!);
    const label = container.querySelector<HTMLElement>("[data-place-photo-reference-context]")!;
    expect(label.textContent).toBe("Reference photo · Appearance unverified");
    expect(label.closest("a, button, details, [hidden], [inert], [aria-hidden='true']")).toBeNull();
    expect(getComputedStyle(label).visibility).toBe("visible");
    expect(container.querySelectorAll("a, button, summary, [data-photo-credit-line]")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Photo by|Photo provided by|\b\d{4}\b/);
  });

  it("keeps an undated owned reference hidden and inert until its exact photo is decoded", async () => {
    await render(getOwnedPlacePhoto("zoes-chocolate-company")!, false);
    const credit = container.querySelector<HTMLElement>(".place-card-photo-credit")!;
    expect(credit.getAttribute("aria-hidden")).toBe("true"); expect(credit.hasAttribute("inert")).toBe(true);
    expect(credit.style.visibility).toBe("hidden");
    expect(container.querySelector("[data-place-photo-reference-context]")?.closest("[inert]")).toBe(credit);
  });

  it("does not impose context or creator-credit requirements on other owned photos", async () => {
    await render(getOwnedPlacePhoto("carroll-creek-linear-park-frederick")!);
    expect(container.childElementCount).toBe(0);
  });
});
