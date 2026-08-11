import { describe, expect, it } from "vitest";
import { selectedPhotoIndex } from "./PlacePhotoGallery";

describe("PlacePhotoGallery selection contract", () => {
  it("keeps the selected photo stable when an earlier failure is removed", () => {
    const selected = "/photo-c";
    expect(selectedPhotoIndex(["/photo-a", "/photo-b", selected], selected)).toBe(2);
    expect(selectedPhotoIndex(["/photo-a", selected], selected)).toBe(1);
  });

  it("closes safely when the selected photo itself fails", () => {
    expect(selectedPhotoIndex(["/photo-a"], "/photo-b")).toBeNull();
    expect(selectedPhotoIndex(["/photo-a"], null)).toBeNull();
  });
});
