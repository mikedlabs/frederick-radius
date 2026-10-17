import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_PHOTO_BYTES_ROOT_MARGIN,
  loadPlacePhotoBytes,
  peekPlacePhotoBytes,
  placePhotoFallbackReason,
  resetPlacePhotoBytesCache,
} from "./place-photo-bytes";

describe("place photo byte transport", () => {
  afterEach(() => {
    resetPlacePhotoBytesCache();
    vi.unstubAllGlobals();
  });

  it("uses a small root margin so offscreen Nearby cards stay quiet", () => {
    expect(GOOGLE_PHOTO_BYTES_ROOT_MARGIN).toBe("48px 0px");
  });

  it("treats any x-photo-fallback value as an honest no-photo result", () => {
    expect(placePhotoFallbackReason(new Headers({ "x-photo-fallback": "daily-cap" }))).toBe("daily-cap");
    expect(placePhotoFallbackReason(new Headers({ "X-Photo-Fallback": "rate-limited" }))).toBe("rate-limited");
    expect(placePhotoFallbackReason(new Headers())).toBeNull();
    expect(placePhotoFallbackReason(new Headers({ "x-photo-fallback": "   " }))).toBeNull();
  });

  it("reuses one object URL for a real photo and never treats a missing header as fallback", async () => {
    const objectUrl = "blob:place-photo-real";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
    });
    const fetcher = vi.fn(async () => new Response(new Blob(["jpeg-bytes"], { type: "image/jpeg" }), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    }));

    const first = await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher);
    const second = await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher);

    expect(first).toEqual({ kind: "photo", objectUrl });
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720")).toEqual(first);
  });

  it("caches a header fallback so a daily-cap response is not retried as a branded image", async () => {
    const fetcher = vi.fn(async () => new Response("<svg></svg>", {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "x-photo-fallback": "daily-cap" },
    }));

    const first = await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher);
    const second = await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher);

    expect(first).toEqual({ kind: "fallback", reason: "daily-cap" });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not permanently hide a photo after a transport error", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(new Blob(["jpeg-bytes"], { type: "image/jpeg" }), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:recovered"),
    });

    expect(await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher))
      .toEqual({ kind: "fallback", reason: "fetch-error" });
    expect(peekPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720")).toBeUndefined();
    expect(await loadPlacePhotoBytes("/api/place-photo?name=places%2Fa%2Fphotos%2Fb&w=720", fetcher))
      .toEqual({ kind: "photo", objectUrl: "blob:recovered" });
  });
});
