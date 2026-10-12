// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodayPhotoCredit } from "./useTodayPhotoCredit";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const name = "places/local-id/photos/exact-photo";
const photo = `/api/place-photo?name=${encodeURIComponent(name)}&w=800`;
const credit: GooglePhotoAttribution = { photo_name: name, google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [{ display_name: "Local photographer", uri: "https://www.google.com/maps/contrib/123" }] };
const place = { slug: "local-place", photo };
const response = (overrides: Record<string, unknown> = {}) => new Response(JSON.stringify({ place: { slug: place.slug, google_photo_url: photo, google_photo_attribution: credit, ...overrides } }));
function Read({ item = place, hydrate = true }: { item?: typeof place & { photoAttribution?: GooglePhotoAttribution }; hydrate?: boolean }) {
  const result = useTodayPhotoCredit(item, hydrate);
  return <span data-allowed={String(result.allowed)}>{result.credit?.authors[0]?.display_name}</span>;
}

describe("Today exact photo credit", () => {
  let root: Root; let host: HTMLDivElement;
  let request: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    request = vi.fn<typeof fetch>(async () => response()); vi.stubGlobal("fetch", request);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const render = async (item = place, hydrate = true) => act(async () => { root.render(<Read item={item} hydrate={hydrate} />); });

  it("hydrates one visible card from the matching reviewed resource without repeating on rerender", async () => {
    await render(); await render({ ...place });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/places/map-card/local-place", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(host.querySelector("[data-allowed=true]")).not.toBeNull();
    expect(host.textContent).toBe("Local photographer");
  });
  it("uses an exact supplied server credit without a request", async () => {
    await act(async () => { root.render(<Read item={{ ...place, photoAttribution: credit }} />); });
    expect(request).not.toHaveBeenCalled(); expect(host.querySelector("[data-allowed=true]")).not.toBeNull();
  });
  it("does not fan out metadata hydration to comparison cards", async () => {
    await render(place, false); expect(request).not.toHaveBeenCalled(); expect(host.querySelector("[data-allowed=false]")).not.toBeNull();
  });
  it.each([
    { slug: "other-place" },
    { google_photo_url: "/api/place-photo?name=places%2Fother%2Fphotos%2Fother" },
    { google_photo_attribution: { ...credit, photo_name: "places/other/photos/other" } },
    { google_photo_attribution: { ...credit, google_maps_uri: "https://www.google.com/maps/place/?q=local" } },
    { google_photo_attribution: undefined },
  ])("rejects mismatched or missing metadata: %s", async (overrides) => {
    request.mockResolvedValue(response(overrides)); await render();
    expect(host.querySelector("[data-allowed=false]")).not.toBeNull(); expect(host.textContent).toBe("");
  });
  it("keeps the fallback on request failure and does not retry on an ordinary rerender", async () => {
    request.mockRejectedValue(new Error("Unavailable")); await render(); await render({ ...place });
    expect(request).toHaveBeenCalledTimes(1); expect(host.querySelector("[data-allowed=false]")).not.toBeNull();
  });
  it("aborts after three seconds even while JSON is unresolved and ignores a late body", async () => {
    vi.useFakeTimers();
    let resolveBody!: (body: unknown) => void;
    request.mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) } as Response);
    await render(); const signal = request.mock.calls[0][1]!.signal!;
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveBody({ place: { slug: place.slug, google_photo_url: photo, google_photo_attribution: credit } }); });
    expect(host.querySelector("[data-allowed=false]")).not.toBeNull();
  });
  it("aborts on unmount", async () => {
    request.mockImplementation(() => new Promise(() => {})); await render();
    const signal = request.mock.calls[0][1]!.signal!;
    act(() => root.render(null)); expect(signal.aborted).toBe(true);
  });
  it("never borrows a previous card's credit after its raw resource changes", async () => {
    await render(); request.mockImplementation(() => new Promise(() => {}));
    await render({ slug: place.slug, photo: "/api/place-photo?name=places%2Flocal-id%2Fphotos%2Fnew-photo" });
    expect(host.querySelector("[data-allowed=false]")).not.toBeNull(); expect(host.textContent).toBe("");
  });
  it("aborts the old identity and ignores its late metadata after the visible card changes", async () => {
    let resolveOld!: (body: unknown) => void;
    request.mockResolvedValueOnce({ ok: true, json: () => new Promise((resolve) => { resolveOld = resolve; }) } as Response);
    await render(); const oldSignal = request.mock.calls[0][1]!.signal!;
    request.mockImplementation(() => new Promise(() => {}));
    await render({ slug: "new-place", photo: "/api/place-photo?name=places%2Fnew%2Fphotos%2Fnew" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { resolveOld({ place: { slug: place.slug, google_photo_url: photo, google_photo_attribution: credit } }); });
    expect(host.querySelector("[data-allowed=false]")).not.toBeNull(); expect(host.textContent).toBe("");
  });
  it("does not hydrate owned imagery or allow direct Google media", async () => {
    await render({ ...place, photo: "/photos/owned.jpg" });
    expect(host.querySelector("[data-allowed=true]")).not.toBeNull(); expect(request).not.toHaveBeenCalled();
    await render({ ...place, photo: "https://places.googleapis.com/v1/places/local/photos/photo/media" });
    expect(host.querySelector("[data-allowed=false]")).not.toBeNull(); expect(request).not.toHaveBeenCalled();
  });
});
