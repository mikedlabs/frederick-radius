/** Owned photography matched to an exact place, never a nearby camera fix,
 * town scene, or category substitute. Add entries only after visual review. */
export type OwnedPlacePhoto = {
  kind: "owned";
  src: string;
  alt: string;
  width: number;
  height: number;
};

export const OWNED_PLACE_PHOTOS: Readonly<Record<string, OwnedPlacePhoto>> = {
  // Same verified Creek scene already used by Today's exact-place doorway.
  // Owner permits this photograph without a public credit or capture date.
  "carroll-creek-linear-park-frederick": {
    kind: "owned",
    src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    alt: "Carroll Creek in Frederick.",
    width: 1920,
    height: 1078,
  },
};

export function getOwnedPlacePhoto(slug: string): OwnedPlacePhoto | null {
  return Object.hasOwn(OWNED_PLACE_PHOTOS, slug) ? OWNED_PLACE_PHOTOS[slug] : null;
}
