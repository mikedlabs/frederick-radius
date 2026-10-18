/** Owned photography matched to an exact place, never a nearby camera fix,
 * town scene, or category substitute. Add entries only after visual review. */
export type OwnedPlacePhoto = {
  kind: "owned";
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Retain the reviewed subject when a card needs a narrower crop. */
  objectPosition?: "center" | "right";
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
  // Existing owner-supplied Seasons photo already identified on Sports.
  "mccurdy-field": {
    kind: "owned",
    src: "/images/seasons/spring/aerial-view-baseball-field.jpg",
    alt: "An aerial view of McCurdy Field and the surrounding Frederick neighborhood.",
    width: 1920,
    height: 1079,
  },
  // Owner-approved 2024 Fair photograph; it does not show current activity.
  "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick": {
    kind: "owned",
    src: "/images/fair/fairgrounds-night-mike-d-1920.jpg",
    alt: "Frederick Fairgrounds at night during The Great Frederick Fair.",
    width: 1920,
    height: 1080,
    objectPosition: "right",
  },
};

export function getOwnedPlacePhoto(slug: string): OwnedPlacePhoto | null {
  return Object.hasOwn(OWNED_PLACE_PHOTOS, slug) ? OWNED_PLACE_PHOTOS[slug] : null;
}
