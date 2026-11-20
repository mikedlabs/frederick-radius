import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentPlacePhotoName: vi.fn(),
}));

vi.mock("@/lib/integrations/google-places", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/google-places")>();
  return {
    ...actual,
    currentPlacePhotoName: mocks.currentPlacePhotoName,
  };
});

import {
  FRESH_PLACE_PHOTO_NAME_TTL_MS,
  rememberRejectedPhotoName,
  resetGooglePhotoNameStateForTests,
  resolveFreshPlacePhotoName,
  resolvePlacePhotoMediaName,
} from "./google-photo-name";

const stored = "places/ChIJtest/photos/stale-photo";
const fresh = "places/ChIJtest/photos/fresh-photo";

describe("request-time Google photo names", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    resetGooglePhotoNameStateForTests();
    mocks.currentPlacePhotoName.mockReset();
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "found", name: fresh });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks Place Details for the current main photo of the stored name's place", async () => {
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledExactlyOnceWith(
      "ChIJtest",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("reuses the fresh name within the short server cache", async () => {
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    vi.setSystemTime(FRESH_PLACE_PHOTO_NAME_TTL_MS - 1);
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledOnce();
  });

  it("looks up again after the cache expires", async () => {
    const later = "places/ChIJtest/photos/later-photo";
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "found", name: later });
    vi.setSystemTime(FRESH_PLACE_PHOTO_NAME_TTL_MS + 1);
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(later);
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledTimes(2);
  });

  it("coalesces in-flight lookups for the same place", async () => {
    let finish!: (value: { status: "found"; name: string }) => void;
    mocks.currentPlacePhotoName.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const first = resolveFreshPlacePhotoName(stored);
    const second = resolveFreshPlacePhotoName(stored);
    finish({ status: "found", name: fresh });

    await expect(first).resolves.toBe(fresh);
    await expect(second).resolves.toBe(fresh);
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledOnce();
  });

  it("does not cache a provider failure, so the next request can retry", async () => {
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "unavailable" });
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBeNull();
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "found", name: fresh });
    await expect(resolveFreshPlacePhotoName(stored)).resolves.toBe(fresh);
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledTimes(2);
  });

  it("prefers the current Place Details name over the stored resource", async () => {
    await expect(resolvePlacePhotoMediaName(stored)).resolves.toEqual({ name: fresh });
  });

  it("falls back to the stored name when Place Details is unavailable", async () => {
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "unavailable" });
    await expect(resolvePlacePhotoMediaName(stored)).resolves.toEqual({ name: stored });
  });

  it("does not retry a rejected name until Details returns a different one", async () => {
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "found", name: stored });
    await expect(resolvePlacePhotoMediaName(stored)).resolves.toEqual({ name: stored });
    rememberRejectedPhotoName(stored, "upstream-400");

    await expect(resolvePlacePhotoMediaName(stored)).resolves.toEqual({
      name: null,
      reason: "upstream-400",
    });
    expect(mocks.currentPlacePhotoName).toHaveBeenCalledOnce();

    vi.setSystemTime(FRESH_PLACE_PHOTO_NAME_TTL_MS + 1);
    mocks.currentPlacePhotoName.mockResolvedValue({ status: "found", name: fresh });
    await expect(resolvePlacePhotoMediaName(stored)).resolves.toEqual({ name: fresh });
  });
});
