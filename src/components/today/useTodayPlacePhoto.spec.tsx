// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodayPlacePhoto } from "./useTodayPlacePhoto";
import TodayPlacePreview from "./TodayPlacePreview";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("in=county") }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const photoName = "places/offline-business/photos/not-current-appearance-reviewed";
const provider = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
const credit = { photo_name: photoName, authors: [{ display_name: "Offline contributor" }] };
type Input = Parameters<typeof useTodayPlacePhoto>[0];

describe("Today default appearance eligibility", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No unapproved photo may hydrate metadata or bytes."); }));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  function Harness({ place }: { place: Input }) {
    const photo = useTodayPlacePhoto(place, 360, true);
    return <output data-has-photo={Boolean(photo.source)} data-photo-loaded={photo.loaded}>{photo.source?.src ?? "no-photo"}</output>;
  }
  async function render(place: Input) { await act(async () => root.render(<Harness place={place} />)); }
  function expectNoPhoto() {
    expect(container.querySelector("output")?.getAttribute("data-has-photo")).toBe("false");
    expect(container.querySelector("output")?.getAttribute("data-photo-loaded")).toBe("false");
    expect(container.textContent).toBe("no-photo");
  }

  it.each(["sabor-de-cuba-restaurant-frederick", "brewers-alley-frederick", "zoes-chocolate-company"])(
    "holds %s and all provider fallbacks without changing its identity registry", async slug => {
      await render({ slug, photo: provider, photoAttribution: credit });
      expectNoPhoto(); expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("does not let missing provider credit unlock a new metadata request", async () => {
    await render({ slug: "offline-unreviewed-business", photo: provider, photoAttribution: null });
    expectNoPhoto(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not let an unregistered first-party inline photo bypass the same policy", async () => {
    await render({ slug: "offline-unreviewed-business", photo: "/images/offline-unreviewed-dish.jpg" });
    expectNoPhoto(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["current", "opening-soon"] as const)("keeps the real %s decision factual and usable without an unapproved merchant image", async availability => {
    await act(async () => root.render(<TodayPlacePreview category="restaurant" hydratePhoto availability={availability} place={{
      slug: "brewers-alley-frederick", name: "Brewer's Alley", rating: null, confidence: "unconfirmed",
      fact: "Hours not confirmed", where: "Frederick", distance: null, photo: provider, photoAttribution: credit,
    }} />));
    expect(container.querySelector("[data-today-place-card]")?.getAttribute("data-has-photo")).toBe("false");
    expect(container.querySelector("img, [data-place-card-photo], .place-card-photo-credit")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Brewer's Alley");
    expect(container.textContent).toContain("Hours not confirmed");
    const detail = container.querySelector<HTMLAnchorElement>('a[aria-label="View place: Brewer\'s Alley"]')!;
    const map = container.querySelector<HTMLAnchorElement>('a[aria-label="Map: Brewer\'s Alley"]')!;
    expect(new URL(detail.href).pathname).toBe("/places/brewers-alley-frederick");
    expect(new URL(map.href).searchParams.get("place")).toBe("brewers-alley-frederick");
    expect(new URL(map.href).searchParams.get("in")).toBe("county");
    expect(fetch).not.toHaveBeenCalled();
  });
});
