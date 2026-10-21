/** Owned photography matched to an exact place, never a nearby camera fix,
 * town scene, or category substitute. Add entries only after visual review. */
export type OwnedPlacePhoto = {
  kind: "owned";
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Retain the reviewed subject when a card needs a narrower crop. */
  objectPosition?: "center" | "left" | "right";
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
  // Existing owner-permitted Seasons photograph, visually reviewed for these
  // exact park and bandshell identities. It does not show a current event.
  "baker-park-frederick": {
    kind: "owned",
    src: "/images/seasons/fall/018.jpg",
    alt: "An aerial view of Baker Park and its bandshell seating in Frederick.",
    width: 1920,
    height: 1079,
    objectPosition: "right",
  },
  "baker-park-bandshell": {
    kind: "owned",
    src: "/images/seasons/fall/018.jpg",
    alt: "The Baker Park Bandshell and outdoor seating in Frederick.",
    width: 1920,
    height: 1079,
    objectPosition: "right",
  },
  // Existing owner-permitted Seasons photo: the exact Baker Park carillon,
  // visually reviewed against its canonical place. It is an establishing view,
  // not a current activity or weather claim; left framing retains the tower.
  "joseph-dill-baker-memorial-carillon-bell-tower": {
    kind: "owned",
    src: "/images/seasons/fall/021.jpg",
    alt: "The Joseph Dill Baker Memorial Carillon in Baker Park, Frederick.",
    width: 1920,
    height: 1279,
    objectPosition: "left",
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
