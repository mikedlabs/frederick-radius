import { describe, expect, it } from "vitest";
import { curatedPhotoReferenceLabel, curatedPhotoSourceLabel } from "./curated-photo-source";

describe("reviewed photograph context", () => {
  it.each([["2018-04-01", "2018"], ["2024-02-29", "2024"], ["2000-02-29", "2000"]])(
    "shows only the known capture year for %s", (capturedOn, year) => {
      expect(curatedPhotoReferenceLabel(capturedOn)).toBe(`Reference photo · ${year}`);
    },
  );
  it.each([undefined, null, 2018, {}, "", "2018", "2018-4-1", " 2018-04-01", "2018-04-01T00:00:00Z",
    "0000-01-01", "2023-02-29", "1900-02-29", "2024-02-30", "2024-04-31", "2024-13-01", "2024-00-10", "2024-01-00"])(
    "leaves invalid or absent capture metadata unknown: %j", value => {
      expect(curatedPhotoReferenceLabel(value)).toBeNull();
    },
  );
  it("keeps capture context independent from publisher and license identity", () => {
    expect(curatedPhotoSourceLabel("https://commons.wikimedia.org/wiki/File:Example.jpg")).toBe("Wikimedia Commons");
    expect(curatedPhotoSourceLabel("https://example.invalid/photo.jpg")).toBe("Photo source");
    expect(curatedPhotoSourceLabel("https://user@commons.wikimedia.org/wiki/File:Example.jpg")).toBe("Photo source");
    expect(curatedPhotoReferenceLabel(undefined)).toBeNull();
  });
});
