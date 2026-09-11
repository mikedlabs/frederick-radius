import { describe, expect, it } from "vitest";
import {
  isPlacePhotoFailureSignal,
  placePhotoFailureSignalSrc,
} from "./PlaceHeroMedia";

describe("PlaceHeroMedia photo-state contract", () => {
  it("asks the paid photo proxy for a detectable failure signal", () => {
    expect(
      placePhotoFailureSignalSrc(
        "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200&slug=test",
      ),
    ).toBe(
      "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200&slug=test&fallback=signal",
    );
  });

  it("leaves non-proxy photos untouched", () => {
    expect(placePhotoFailureSignalSrc("https://commons.wikimedia.org/photo.jpg"))
      .toBe("https://commons.wikimedia.org/photo.jpg");
  });

  it("distinguishes the transparent proxy signal from real photography", () => {
    expect(isPlacePhotoFailureSignal({ naturalWidth: 1, naturalHeight: 1 }))
      .toBe(true);
    expect(isPlacePhotoFailureSignal({ naturalWidth: 1200, naturalHeight: 800 }))
      .toBe(false);
  });
});
