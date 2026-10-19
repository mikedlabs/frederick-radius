// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture image exposes real React load/error handlers. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import { placeCardPhotoPlan, placePhotoFailureSignalSrc, type PlaceCardPhotoPlan } from "@/lib/place-card-photo";
import { getLandmarkPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
const imageCallbacks = vi.hoisted(() => new Map<string, { load: React.ReactEventHandler<HTMLImageElement>; error: React.ReactEventHandler<HTMLImageElement> }>());
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError, ...props }: { src: string; alt: string; onLoad: React.ReactEventHandler<HTMLImageElement>; onError: React.ReactEventHandler<HTMLImageElement>; "aria-hidden"?: boolean; "data-map-peek-photo-state"?: string; "data-map-peek-photo-source"?: string; style?: React.CSSProperties }) => {
  imageCallbacks.set(src, { load: onLoad, error: onError });
  return <img src={src} alt={alt} aria-hidden={props["aria-hidden"]} data-map-peek-photo-state={props["data-map-peek-photo-state"]} data-map-peek-photo-source={props["data-map-peek-photo-source"]} onLoad={onLoad} onError={onError} style={props.style as React.CSSProperties | undefined} />;
} }));
vi.mock("@/hooks/useFollows", () => ({
  useIsFollowed: () => false,
  useFollowMutationState: () => "idle",
  useToggleFollow: () => vi.fn(),
}));
vi.mock("@/lib/track", () => ({ logActivity: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ trackDecision: vi.fn() }));
import MapPeek, { MapPeekPhoto } from "./MapPeek";
import type { MapPinPlace } from "./types";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const photoName = "places/fixture-venue/photos/fixture-front";
const src = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
const credit: GooglePhotoAttribution = { photo_name: photoName, google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [{ display_name: "Fixture Photographer", uri: "https://www.google.com/maps/contrib/123" }] };

function planForSource(source?: string, googlePhoto = true): PlaceCardPhotoPlan {
  return {
    key: JSON.stringify([source ?? null, googlePhoto]),
    sources: source ? [googlePhoto
      ? { kind: "google", src: placePhotoFailureSignalSrc(source), alt: "", attribution: {
          ...credit, photo_name: new URL(source, "https://frederickradius.app").searchParams.get("name") ?? photoName,
        } }
      : { kind: "owned", src: source, alt: "" }] : [],
  };
}

describe("MapPeek selected photo and source identity", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); openDetails.mockClear(); imageCallbacks.clear(); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const openDetails = vi.fn();
  const render = async (source = src, googlePhoto = true) => act(async () => root.render(<MapPeekPhoto key="fixture-venue" plan={planForSource(source, googlePhoto)} placeName="Fixture venue" glyph="F" color="var(--app-brand)" onOpenDetails={openDetails} />));
  const load = async (width: number, height: number) => {
    const image = host.querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
    await act(async () => image.dispatchEvent(new Event("load")));
  };
  it("requests the transparent proxy signal and withholds venue alt and credit until genuine image bytes load", async () => {
    await render();
    expect(host.querySelector("img")?.src).toContain("fallback=signal");
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(800, 600);
    expect(host.querySelector("img")?.alt).toBe("Photo of Fixture venue");
    expect(host.querySelector("img")?.hasAttribute("aria-hidden")).toBe(false);
    expect(host.textContent).toContain("Photo by Fixture Photographer");
    expect(host.querySelector(`a[href="${credit.google_maps_uri}"]`)).not.toBeNull();
    expect(host.querySelector("button a")).toBeNull();
    const action = host.querySelector("button")!;
    expect(action.getAttribute("aria-label")).toBe("Open details for Fixture venue");
    await act(async () => action.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(openDetails).toHaveBeenCalledOnce();
    const creditTargets = host.querySelector(".map-peek-source-credit")!;
    expect(creditTargets.querySelector(".place-card-photo-credit")?.className).toContain("[&_a]:min-h-[44px]");
    expect(creditTargets.querySelector(".place-card-photo-credit")?.className).toContain("[&_a]:min-w-[44px]");
    for (const link of host.querySelectorAll(".map-peek-source-credit a")) {
      expect(link.className).toContain("tap-44-y");
    }
  });
  it.each([[1, 1], [1, 600], [800, 1]])("replaces a %s by %s pixel signal with category artwork and no photo attribution", async (width, height) => {
    await render(); await load(width, height);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-map-peek-photo-state=failed]")).toBeTruthy();
    expect(host.textContent).toBe("F");
    expect(host.querySelector("a")).toBeNull();
  });
  it("removes failed image bytes and their credit together even after a successful load", async () => {
    await render(); await load(800, 600);
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("F");
    expect(host.querySelector("a")).toBeNull();
  });
  it("uses a new readiness boundary for a new source and never borrows the previous image's ready state", async () => {
    await render(); await load(800, 600);
    const next = "/api/place-photo?name=places%2Ffixture-venue%2Fphotos%2Ffixture-side&w=800";
    await render(next);
    expect(host.querySelector("img")?.src).toContain("fixture-side");
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(1, 1);
    await render(src);
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(800, 600);
    expect(host.textContent).toContain("Fixture Photographer");
  });
  it("retains focused Details through metadata/source changes and ignores stale image callbacks", async () => {
    const update = async (source?: string) => act(async () => root.render(<MapPeekPhoto key="fixture-venue" plan={planForSource(source)} placeName="Fixture venue" glyph="F" color="var(--app-brand)" onOpenDetails={openDetails}><div><button type="button">Details</button></div></MapPeekPhoto>));
    await update();
    const details = host.querySelectorAll("button")[1];
    details.focus();
    await update(src);
    expect(host.querySelectorAll("button")[1]).toBe(details);
    expect(document.activeElement).toBe(details);
    await load(800, 600);
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(oldImage.getAttribute("src")!)!;
    const next = "/api/place-photo?name=places%2Ffixture-venue%2Fphotos%2Ffixture-side&w=800";
    await update(next);
    expect(host.querySelectorAll("button")[1]).toBe(details);
    expect(document.activeElement).toBe(details);
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await act(async () => {
      oldCallbacks.load({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
      oldCallbacks.error({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(900, 600);
    expect(host.textContent).toContain("Fixture Photographer");
    expect(document.activeElement).toBe(details);
  });
  it("keeps an unpictured venue actionable without a fake image or source credit", async () => {
    await act(async () => root.render(<MapPeekPhoto plan={planForSource()} placeName="Fixture venue" glyph="F" color="var(--app-brand)" onOpenDetails={openDetails} />));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    await act(async () => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(openDetails).toHaveBeenCalledOnce();
  });
  it("keeps Radius-owned source bytes without borrowing Google credits", async () => {
    await render("/photos/fixture-owned.jpg", false); await load(900, 600);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/photos/fixture-owned.jpg");
    expect(host.querySelector("img")?.alt).toBe("Photo of Fixture venue");
    expect(host.textContent).not.toContain("Fixture Photographer");
    expect(host.querySelector("a")).toBeNull();
  });
  it("keeps an exact Commons fallback visible after the selected Google image fails", async () => {
    const slug = "baker-park-frederick";
    const plan = placeCardPhotoPlan({ slug, google_photo_url: src, google_photo_attribution: credit }, 78);
    const landmark = getLandmarkPhoto(slug)!;
    expect(plan.sources.map(source => source.kind)).toEqual(["google", "curated"]);
    // These legacy fields let this single regression run against the old
    // component too: it receives the same Google source but ignores `plan`
    // and incorrectly stops at a letter. The production caller passes plan.
    const props = {
      plan, src, googlePhoto: true, attribution: credit,
      placeName: "Baker Park", glyph: "B", color: "var(--app-brand)", onOpenDetails: openDetails,
    };
    await act(async () => root.render(<MapPeekPhoto {...props}><button type="button">Details</button></MapPeekPhoto>));
    const details = host.querySelectorAll("button")[1];
    details.focus();
    const googleImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(googleImage.getAttribute("src")!)!;
    await load(1, 1);
    const fallback = host.querySelector("img");
    expect(fallback?.getAttribute("src")).toBe(wikimediaUrl(landmark.file, 156));
    expect(fallback?.getAttribute("data-map-peek-photo-source")).toBe("curated");
    expect(fallback?.alt).toBe("");
    expect(host.textContent).not.toContain(credit.authors[0].display_name);
    expect(host.textContent).not.toContain(landmark.author);
    expect(document.activeElement).toBe(details);
    await load(1280, 891);
    expect(host.querySelector("img")?.alt).toBe(landmark.alt);
    expect(host.textContent).toContain(`Photo by ${landmark.author}.`);
    expect(host.textContent).toContain("The image is resized for display; previews may be cropped.");
    expect(host.querySelector(`a[href="${landmark.source_url}"]`)).not.toBeNull();
    expect(host.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0"]')).not.toBeNull();
    expect(host.querySelector("button a")).toBeNull();
    await act(async () => {
      oldCallbacks.load({ currentTarget: googleImage } as React.SyntheticEvent<HTMLImageElement>);
      oldCallbacks.error({ currentTarget: googleImage } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(host.querySelector("img")).toBe(fallback);
    expect(host.textContent).toContain(`Photo by ${landmark.author}.`);
    await act(async () => fallback!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toBe("BDetails");
    expect(document.activeElement).toBe(details);
    await act(async () => root.render(<MapPeekPhoto {...props}><button type="button">Details</button></MapPeekPhoto>));
    expect(host.querySelector("img")).toBeNull();
  });

  it("ignores callbacks from the first A after an A to B to A plan change", async () => {
    await render();
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(oldImage.getAttribute("src")!)!;
    await render("/api/place-photo?name=places%2Ffixture-venue%2Fphotos%2Ffixture-side&w=800");
    await render();
    await act(async () => {
      oldCallbacks.load({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
      oldCallbacks.error({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.querySelector("img")?.getAttribute("data-map-peek-photo-state")).toBe("loading");
    expect(host.querySelector("a")).toBeNull();
    await load(900, 600);
    expect(host.querySelector("img")?.getAttribute("data-map-peek-photo-state")).toBe("ready");
    expect(host.textContent).toContain("Fixture Photographer");
  });

  it("hydrates one selected map card and uses its existing URL/credit payload without an API plan field", async () => {
    const slug = "baker-park-frederick";
    const place: MapPinPlace = {
      slug, name: "Baker Park", category: "outdoors", municipality: "frederick",
      geom: { lat: 39.418, lng: -77.415 }, source: "manual", is_verified: true,
      open_status: { state: "unknown" }, short_blurb: "A selected-card test fixture.",
    };
    let resolve!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetchCard = vi.fn<(input: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(() => new Promise(done => { resolve = done; }));
    vi.stubGlobal("fetch", fetchCard);
    await act(async () => root.render(<MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from you" onClose={vi.fn()} onDetails={openDetails} />));
    expect(fetchCard).toHaveBeenCalledOnce();
    expect(fetchCard.mock.calls[0][0]).toBe(`/api/places/map-card/${slug}`);
    expect(host.querySelector("img")).toBeNull();
    await act(async () => resolve({ ok: true, json: async () => ({ place: {
      slug, address: "Test address", open_status: { state: "unknown" },
      google_photo_url: src + `&slug=${slug}`, google_photo_attribution: credit,
    } }) }));
    const google = host.querySelector("img")!;
    expect(google.getAttribute("data-map-peek-photo-source")).toBe("google");
    expect(new URL(google.getAttribute("src")!, "https://frederickradius.app").searchParams.get("w")).toBe("208");
    await load(1, 1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(wikimediaUrl(getLandmarkPhoto(slug)!.file, 720));
    await load(1280, 891);
    expect(host.textContent).toContain("Photo by Acroterion.");
    expect(fetchCard).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Hours not posted");
    expect(host.textContent).toContain("Directions");
    expect(host.textContent).toContain("Save");
  });

  it.each([".map-peek-visual", ".map-peek-title-button", ".map-peek-details-link"])("hands the actual %s opener to the sheet callback without relying on pointer focus", async selector => {
    const place: MapPinPlace = {
      slug: "map-focus-fixture", name: "Map focus fixture", category: "shops", municipality: "frederick",
      geom: { lat: 39.4143, lng: -77.4105 }, source: "manual", is_verified: true,
      open_status: { state: "unknown" }, short_blurb: "A selected-card focus fixture.",
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const observedOpeners: Array<Element | null> = [];
    await act(async () => root.render(<MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from you"
      onClose={vi.fn()} onDetails={() => observedOpeners.push(document.activeElement)} />));
    const opener = host.querySelector<HTMLButtonElement>(selector)!;
    expect(opener).not.toBeNull();
    expect(document.activeElement).not.toBe(opener);
    // DOM click supplies no preparatory focus, reproducing the missing
    // handoff that the real Safari Close/Escape/Back acceptance test caught.
    await act(async () => opener.click());
    expect(observedOpeners).toEqual([opener]);
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    ["carroll-creek-linear-park-frederick", "Carroll Creek Linear Park"],
    ["mccurdy-field", "McCurdy Field"],
    ["frederick-fairgrounds-home-of-the-great-frederick-fair-frederick", "Frederick Fairgrounds"],
    ["brewers-alley-frederick", "Brewer's Alley"],
  ])("uses reviewed %s imagery while selected metadata is still pending", async (slug, name) => {
    const place: MapPinPlace = {
      slug, name, category: "outdoors", municipality: "frederick",
      geom: { lat: 39.4143, lng: -77.4105 }, source: "manual", is_verified: true,
      open_status: { state: "unknown" }, short_blurb: "A selected-card image fixture.",
    };
    const fetchCard = vi.fn<(input: string) => Promise<Response>>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchCard);
    await act(async () => root.render(<MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from you" onClose={vi.fn()} onDetails={openDetails} />));
    const image = host.querySelector("img")!;
    expect(image).not.toBeNull();
    expect(image.src).not.toContain("/api/place-photo");
    expect(image.getAttribute("data-map-peek-photo-source")).toBe(slug === "brewers-alley-frederick" ? "curated" : "owned");
    if (slug.includes("fairgrounds")) expect(image.style.objectPosition).toBe("right");
    await load(1920, 1080);
    expect(host.querySelector("[data-map-place-slug]")?.getAttribute("data-has-photo")).toBe("true");
    expect(host.querySelector("img")?.alt).toContain(slug === "brewers-alley-frederick" ? "2004" : name.split(" ")[0]);
    expect(fetchCard).toHaveBeenCalledOnce();
    expect(fetchCard.mock.calls[0][0]).toBe(`/api/places/map-card/${slug}`);
    expect(host.querySelector("button a, a button")).toBeNull();
    for (const action of host.querySelectorAll(".map-peek-acts > *")) {
      expect(action.getAttribute("data-press-target")).toBe("control");
      expect(action.querySelector(":scope > [data-press-face]")).not.toBeNull();
    }
  });

  it("keeps the same decoded owned image and focused Details when metadata adds a Google fallback", async () => {
    const slug = "carroll-creek-linear-park-frederick";
    const place: MapPinPlace = {
      slug, name: "Carroll Creek Linear Park", category: "outdoors", municipality: "frederick",
      geom: { lat: 39.4143, lng: -77.4105 }, source: "manual", is_verified: true,
      open_status: { state: "unknown" }, short_blurb: "A selected-card continuity fixture.",
    };
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    await act(async () => root.render(<MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from you" onClose={vi.fn()} onDetails={openDetails} />));
    await load(1920, 1078);
    const image = host.querySelector("img")!;
    const details = host.querySelector<HTMLButtonElement>(".map-peek-details-link")!;
    details.focus();
    await act(async () => resolve(Response.json({ place: {
      slug, address: "Carroll Creek", google_photo_url: src, google_photo_attribution: credit,
    } })));
    expect(host.querySelector("img")).toBe(image);
    expect(image.dataset.mapPeekPhotoState).toBe("ready");
    expect(image.alt).toBe(getOwnedPlacePhoto(slug)!.alt);
    expect(host.querySelector(".map-peek-source-credit")).toBeNull();
    expect(document.activeElement).toBe(details);
    expect(host.querySelectorAll("img")).toHaveLength(1);
  });

  it("keeps exact owned Creek imagery available after selected metadata is unavailable", async () => {
    const slug = "carroll-creek-linear-park-frederick";
    const place: MapPinPlace = {
      slug, name: "Carroll Creek Linear Park", category: "outdoors", municipality: "frederick",
      geom: { lat: 39.4143, lng: -77.4105 }, source: "manual", is_verified: true,
      open_status: { state: "unknown" }, short_blurb: "A selected-card test fixture.",
    };
    const fetchCard = vi.fn(async () => { throw new Error("Controlled metadata failure"); });
    vi.stubGlobal("fetch", fetchCard);
    await act(async () => root.render(<MapPeek place={place} distanceOrigin={null} distanceOriginLabel="from you" onClose={vi.fn()} onDetails={openDetails} />));
    expect(host.querySelector("img")?.getAttribute("data-map-peek-photo-source")).toBe("owned");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(getOwnedPlacePhoto(slug)!.src);
    await load(1920, 1078);
    expect(host.querySelector(".map-peek-source-credit")).toBeNull();
    expect(host.querySelector("img")?.alt).toBe(getOwnedPlacePhoto(slug)!.alt);
    expect(fetchCard).toHaveBeenCalledOnce();
  });

});
