import { describe, expect, it } from "vitest";
import {
  mergeGooglePhotoMetadata,
  needsGooglePhotoMetadata,
} from "@/lib/google-photo-backfill";

const PHOTO = "places/ChIJexample/photos/one";

describe("Google photo metadata backfill", () => {
  it("targets legacy names that have no exact publishable attribution", () => {
    expect(
      needsGooglePhotoMetadata({
        google_place_id: "ChIJexample",
        photo_names: [PHOTO],
      }),
    ).toBe(true);
    expect(
      needsGooglePhotoMetadata({
        google_place_id: "df530287-9ddd-4d4b-942c-d3210808113f",
        photo_names: [PHOTO],
      }),
    ).toBe(false);
  });

  it("preserves unrelated enrichment while merging photo-scoped fields", () => {
    const merged = mergeGooglePhotoMetadata(
      {
        google_place_id: "ChIJexample",
        business_status: "OPERATIONAL",
        rating: 4.8,
        photo_names: ["places/ChIJexample/photos/old"],
      },
      {
        photo_names: [PHOTO],
        photo_attributions: [
          {
            photo_name: PHOTO,
            google_maps_uri: "https://www.google.com/maps/photos/example",
            authors: [{ display_name: "Local photographer" }],
          },
        ],
      },
      "2026-07-23T12:00:00Z",
    );

    expect(merged.rating).toBe(4.8);
    expect(merged.business_status).toBe("OPERATIONAL");
    expect(merged.photo_names).toEqual([PHOTO]);
    expect(merged.photo_metadata_refreshed_at).toBe(
      "2026-07-23T12:00:00Z",
    );
  });
});
