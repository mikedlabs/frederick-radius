/** Owned photography matched to an exact place, never a nearby camera fix,
 * town scene, or category substitute. Add entries only after visual review. */
export type OwnedPlacePhoto = {
  kind: "owned";
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Retain the reviewed subject when a card needs a narrower crop. */
  objectPosition?: "center" | "left" | "right" | "top" | "bottom";
};

export const OWNED_PLACE_PHOTOS: Readonly<Record<string, OwnedPlacePhoto>> = {
  // Owner's Photos export, independently matched by the VISITATION facade.
  // A scenic establishing view, never a statement about current hotel services.
  "visitation-hotel": {
    kind: "owned",
    src: "/images/places/visitation-hotel-detail.jpg",
    alt: "The Visitation Hotel facade, balconies and courtyard in Frederick at sunset.",
    width: 1123,
    height: 626,
    objectPosition: "right",
  },
  // Existing owner-permitted Seasons photographs, individually inspected for
  // the named storefront, distinctive playground and church facade. Camera
  // coordinates alone do not establish a place match. These are establishing
  // views, not current weather, activity, services or opening-hours evidence.
  "zoes-chocolate-company": {
    kind: "owned",
    src: "/images/seasons/winter/IMG_2732.jpg",
    alt: "The red storefront and entrance of Zoe's Chocolate Company on North Market Street in winter.",
    width: 1920,
    height: 2400,
    objectPosition: "center",
  },
  "sophie-madigans-playground-frederick": {
    kind: "owned",
    src: "/images/seasons/spring/010.jpg",
    alt: "An aerial view of the rainbow paths and play equipment at Sophie & Madigan's Playground in Frederick.",
    width: 1920,
    height: 1079,
    objectPosition: "center",
  },
  "calvary-united-methodist-church-of-frederick-maryland": {
    kind: "owned",
    src: "/images/seasons/fall/001.jpg",
    alt: "The stone facade and tower of Calvary United Methodist Church beside Baker Park in Frederick.",
    width: 1920,
    height: 3413,
    objectPosition: "top",
  },
  // Existing owner-permitted Seasons view, visually matched to the central
  // City Hall facade and courtyard. It does not establish current conditions.
  "city-hall-8": {
    kind: "owned",
    src: "/images/seasons/winter/013.jpg",
    alt: "Frederick City Hall and its courtyard in winter.",
    width: 1920,
    height: 1440,
    objectPosition: "center",
  },
  // Owner's Photos export, visually reviewed for the Creek, bridges and paths.
  // The public derivative carries no private GPS or camera metadata.
  "carroll-creek-linear-park-frederick": {
    kind: "owned",
    src: "/images/places/carroll-creek-aerial.jpg",
    alt: "An aerial view of Carroll Creek, its bridges and tree-lined paths in Frederick.",
    width: 1920,
    height: 1078,
  },
  // A detail crop of the same reviewed owner photograph keeps the park
  // visible on compact cards. It does not show a current event.
  "baker-park-frederick": {
    kind: "owned",
    src: "/images/places/baker-park-detail.jpg",
    alt: "An aerial view of Baker Park's lawns, carillon and bandshell in Frederick at dusk.",
    width: 1439,
    height: 561,
    objectPosition: "center",
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
    src: "/images/places/carillon-sunset.jpg",
    alt: "The Joseph Dill Baker Memorial Carillon beside the creek and lawns of Baker Park at sunset.",
    width: 1920,
    height: 1079,
    objectPosition: "right",
  },
  // Existing owner-permitted Seasons photographs, visually reviewed against
  // these exact Church Street / East Second Street landmarks. They show the
  // named tower or spires, not current services, opening hours or activity.
  "st-john-the-evangelist-catholic-church-frederick": {
    kind: "owned",
    src: "/images/places/church-street-sunset.jpg",
    alt: "The illuminated clock tower of St. John the Evangelist Catholic Church in Frederick at sunset.",
    width: 1920,
    height: 1079,
    objectPosition: "left",
  },
  "evangelical-lutheran-church": {
    kind: "owned",
    src: "/images/seasons/spring/016.jpg",
    alt: "The twin spires of Evangelical Lutheran Church on Church Street in Frederick.",
    width: 1920,
    height: 1080,
    objectPosition: "left",
  },
  "trinity-chapel": {
    kind: "owned",
    src: "/images/seasons/winter/WINTER NEW 7.jpg",
    alt: "The spire and fish weather vane of Trinity Chapel on Church Street in Frederick.",
    width: 1920,
    height: 1079,
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

/** Individually reviewed alternate frames for existing detail galleries.
 * These are explicit subjects, not card fallbacks or nearby-place guesses. */
const OWNED_PLACE_PHOTO_ALTERNATES: Readonly<Record<string, readonly OwnedPlacePhoto[]>> = {
  "carroll-creek-linear-park-frederick": [{
    kind: "owned", src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    alt: "Carroll Creek in Frederick.", width: 1920, height: 1078,
  }],
  "baker-park-frederick": [{
    kind: "owned", src: "/images/places/baker-park-sunset.jpg",
    alt: "Baker Park, its carillon and bandshell beneath a sunset sky in Frederick.",
    width: 1920, height: 1079, objectPosition: "center",
  }, {
    kind: "owned", src: "/images/seasons/fall/018.jpg",
    alt: "An aerial view of Baker Park and its bandshell seating in Frederick.",
    width: 1920, height: 1079, objectPosition: "right",
  }],
  "joseph-dill-baker-memorial-carillon-bell-tower": [{
    kind: "owned", src: "/images/seasons/fall/021.jpg",
    alt: "The Joseph Dill Baker Memorial Carillon in Baker Park, Frederick.",
    width: 1920, height: 1279, objectPosition: "left",
  }],
  "st-john-the-evangelist-catholic-church-frederick": [{
    kind: "owned", src: "/images/seasons/winter/PG134 Replacement.jpg",
    alt: "The clock tower and cross of St. John the Evangelist Catholic Church in Frederick.",
    width: 1920, height: 1080,
  }],
  "visitation-hotel": [{
    kind: "owned", src: "/images/places/visitation-hotel-sunset.jpg",
    alt: "The Visitation Hotel facade and courtyard in Frederick at sunset.",
    width: 1920, height: 1080, objectPosition: "right",
  }, {
    kind: "owned", src: "/images/places/church-street-sunset.jpg",
    alt: "The illuminated Visitation Hotel facade and courtyard on East Church Street at sunset.",
    width: 1920, height: 1079, objectPosition: "right",
  }],
  // Keep the existing licensed color exterior as the hero. This owner's
  // monochrome Patrick Street photograph is an additional gallery view only.
  "weinberg-center-for-the-arts-frederick": [{
    kind: "owned", src: "/images/places/weinberg-patrick-street.jpg",
    alt: "A black-and-white Patrick Street view of the Weinberg Center marquee in Frederick.",
    width: 1920, height: 1440, objectPosition: "right",
  }],
};

export function getOwnedPlacePhoto(slug: string): OwnedPlacePhoto | null {
  return Object.hasOwn(OWNED_PLACE_PHOTOS, slug) ? OWNED_PLACE_PHOTOS[slug] : null;
}

export function getOwnedPlacePhotos(slug: string): readonly OwnedPlacePhoto[] {
  const primary = getOwnedPlacePhoto(slug);
  const extra = Object.hasOwn(OWNED_PLACE_PHOTO_ALTERNATES, slug) ? OWNED_PLACE_PHOTO_ALTERNATES[slug] : [];
  return primary ? [primary, ...extra] : extra;
}
