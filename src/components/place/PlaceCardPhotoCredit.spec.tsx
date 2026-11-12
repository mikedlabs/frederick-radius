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

describe("visible dated-reference photo credits", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(selected: PlaceCardPhotoSource = source, loaded = true, discloseModifications = true) {
    await act(async () => root.render(<PlaceCardPhotoCredit source={selected} loaded={loaded} touchTarget compact discloseModifications={discloseModifications} />));
  }

  it("shows the known capture year outside collapsed details without removing full credits", async () => {
    await render(); const label = container.querySelector<HTMLElement>("[data-photo-reference]")!;
    expect(label.textContent).toBe("Reference photo · 2018");
    expect(label.closest("details, a, button, [hidden], [inert], [aria-hidden='true']")).toBeNull();
    expect(getComputedStyle(label).visibility).toBe("visible");
    const details = container.querySelector<HTMLDetailsElement>("details")!;
    expect(details.open).toBe(false); expect(details.textContent).toContain(photo.modifications);
    expect(container.querySelector(`a[href="${photo.source_url}"]`)?.textContent).toBe(photo.author);
    expect(container.querySelector(`a[href="${photo.licenseUrl}"]`)?.textContent).toBe(photo.license);
    details.open = true;
    expect(label.closest("details")).toBeNull(); expect(details.textContent).toContain("April 2018");
  });

  it("retains the visible reference label when full modifications are already expanded", async () => {
    await render(source, true, false);
    expect(container.querySelectorAll("[data-photo-reference]")).toHaveLength(1);
    expect(container.querySelector("[data-photo-reference]")?.textContent).toBe("Reference photo · 2018");
    expect(container.textContent).toContain(photo.modifications);
    expect(container.querySelector("details")).toBeNull();
  });

  it("shows Brewer's known 2004 reference year outside its collapsed edit disclosure", async () => {
    const brewer = getLandmarkPhoto("brewers-alley-frederick")!;
    await render({ kind: "curated", src: brewer.localSrc!, alt: brewer.alt, photo: brewer });
    const label = container.querySelector<HTMLElement>("[data-photo-reference]")!;
    expect(label.textContent).toBe("Reference photo · 2004");
    expect(label.closest("details, a, button, [hidden], [inert], [aria-hidden='true']")).toBeNull();
    expect(getComputedStyle(label).visibility).toBe("visible");
    const details = container.querySelector<HTMLDetailsElement>("details")!;
    expect(details.open).toBe(false); expect(details.textContent).toContain("October 26, 2004");
    expect(container.querySelector(`a[href="${brewer.source_url}"]`)?.textContent).toBe(brewer.author);
    expect(container.querySelector(`a[href="${brewer.licenseUrl}"]`)?.textContent).toBe(brewer.license);
  });

  it("keeps the entire pending credit and reference label hidden and inert until decoded", async () => {
    await render(source, false); const credit = container.querySelector<HTMLElement>(".place-card-photo-credit")!;
    expect(credit.hasAttribute("inert")).toBe(true); expect(credit.getAttribute("aria-hidden")).toBe("true");
    expect(credit.style.visibility).toBe("hidden");
    expect(container.querySelector("[data-photo-reference]")?.closest("[inert]")).toBe(credit);
  });

  it("leaves unknown and invalid dates unlabeled while preserving their provenance", async () => {
    const county = getLandmarkPhoto("ballenger-creek-park-frederick")!;
    await render({ kind: "curated", src: county.localSrc!, alt: county.alt, photo: county });
    expect(container.querySelector("[data-photo-reference]")).toBeNull();
    expect(container.querySelector("summary")?.textContent).toBe("Photo details");
    expect(container.textContent).toContain("Photo capture date unknown");
    await render({ ...source, photo: { ...photo, capturedOn: "2023-02-29" } });
    expect(container.querySelector("[data-photo-reference]")).toBeNull();
    expect(container.textContent).toContain(photo.author);
  });

  it.each(["zoes-chocolate-company", "visitation-hotel"])("shows only the unverified appearance context for %s", async slug => {
    await render(getOwnedPlacePhoto(slug)!);
    const label = container.querySelector<HTMLElement>("[data-place-photo-reference-context]")!;
    expect(label.textContent).toBe("Reference photo · Appearance unverified");
    expect(label.closest("a, button, details, [hidden], [inert], [aria-hidden='true']")).toBeNull();
    expect(getComputedStyle(label).visibility).toBe("visible");
    expect(container.querySelectorAll("a, button, summary, [data-photo-reference]")).toHaveLength(0);
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
