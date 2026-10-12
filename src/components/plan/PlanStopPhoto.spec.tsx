// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- A native test image exposes source-failure load events. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanStop } from "@/lib/integrations/planner";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
vi.mock("next/image", () => ({ default: ({ src, onLoad, onError }: { src: string; onLoad?: React.ReactEventHandler<HTMLImageElement>; onError?: React.ReactEventHandler<HTMLImageElement> }) => <img src={src} alt="" onLoad={onLoad} onError={onError} /> }));
import PlanStopPhoto from "./PlanStopPhoto";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const name = "places/place-id/photos/photo-id";
const raw = `/api/place-photo?name=${encodeURIComponent(name)}&w=800`;
const credit: GooglePhotoAttribution = { photo_name: name, google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [{ display_name: "Local Photographer", uri: "https://www.google.com/maps/contrib/123" }] };
const stop = (photo_url: string | undefined = raw, extra: Partial<PlaceCardData> = {}): PlanStop => ({ order: 1, spec_index: 0, at: "2026-10-12T17:00:00Z", duration_min: 80, why: "A local restaurant.", open: "unknown", photo_url, place: { slug: "local-lunch", name: "Local lunch", ...extra } as PlaceCardData });
const response = (overrides: Record<string, unknown> = {}) => ({ ok: true, json: async () => ({ place: { slug: "local-lunch", google_photo_url: raw, google_photo_attribution: credit, ...overrides } }) });
describe("plan stop photo source identity", () => {
  let root: Root; let host: HTMLDivElement; let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); fetchMock = vi.fn(async () => response()); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const render = async (item = stop()) => act(async () => { root.render(<PlanStopPhoto stop={item} />); });
  it("hydrates available credits omitted by the slim place snapshot before displaying the matching photo", async () => {
    await render();
    expect(fetchMock).toHaveBeenCalledWith("/api/places/map-card/local-lunch", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(host.querySelector("img")?.src).toContain("fallback=signal");
    expect(host.textContent).toContain("Photo by Local Photographer");
    expect(host.querySelector(`a[href="${credit.google_maps_uri}"]`)?.textContent).toBe("Google Maps");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
  it("uses exact supplied photo credits without hydration", async () => {
    await render(stop(raw, { google_photo_attribution: credit }));
    expect(host.textContent).toContain("Local Photographer"); expect(host.querySelector("img")).not.toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { slug: "another-place" }, { google_photo_url: "/api/place-photo?name=another-resource" },
    { google_photo_attribution: { ...credit, photo_name: "another-resource" } },
    { google_photo_attribution: { ...credit, google_maps_uri: "https://www.google.com/maps/place/?q=local-lunch" } },
    { google_photo_attribution: undefined },
  ])("never pairs a displayed photo with missing or mismatched attribution: %s", async (overrides) => {
    fetchMock.mockResolvedValue(response(overrides)); await render();
    expect(host.querySelector("img")).toBeNull(); expect(host.textContent).not.toContain("Local Photographer");
  });
  it("retains the details layout without a fake image when credit hydration fails", async () => {
    fetchMock.mockRejectedValue(new Error("Unavailable")); await render(); expect(host.querySelector("img")).toBeNull(); expect(host.textContent).toBe("");
  });
  it("collapses a one-pixel source-failure signal together with its credit line", async () => {
    await render(); const image = host.querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1 }); Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1 });
    await act(async () => image.dispatchEvent(new Event("load")));
    expect(host.querySelector("[data-plan-stop-photo]")).toBeNull(); expect(host.textContent).not.toContain("Local Photographer");
  });
  it("collapses a failed image and does not substitute decorative or fabricated media", async () => {
    await render(); await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull(); expect(host.querySelector("[data-plan-stop-photo]")).toBeNull();
  });
  it("renders owned imagery cleanly without requesting Google metadata or adding a credit", async () => {
    await render(stop("/photos/carroll-creek.jpg")); expect(host.querySelector("img")?.getAttribute("src")).toBe("/photos/carroll-creek.jpg"); expect(host.textContent).toBe(""); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not borrow credits from a previous stop while the next photo is resolving", async () => {
    await render(); fetchMock.mockImplementation(() => new Promise(() => {}));
    await render(stop("/api/place-photo?name=places%2Fother%2Fphotos%2Fother"));
    expect(host.querySelector("img")).toBeNull(); expect(host.textContent).not.toContain("Local Photographer");
  });
  it("aborts pending metadata hydration when the photo unmounts", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); await render(); const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  });
  it("keeps a canonical event venue photo paired with its available credit without hydration", async () => {
    const item = stop(); delete item.place;
    item.event = { hero_image: raw, hero_image_attribution: { kind: "venue", provider: "google_maps", venue_name: "Local venue", source_uri: credit.google_maps_uri, authors: credit.authors } } as NonNullable<PlanStop["event"]>;
    await render(item); expect(host.querySelector("img")).not.toBeNull(); expect(host.textContent).toContain("Venue · Local venue"); expect(host.textContent).toContain("Local Photographer"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows no stock fallback for an absent photo", async () => {
    const item = stop(); delete item.photo_url; await render(item); expect(host.innerHTML).toBe(""); expect(fetchMock).not.toHaveBeenCalled();
  });
});
