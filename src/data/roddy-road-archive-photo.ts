// Archive record for this exact bridge. The collection gives a capture range.
export const RODDY_ROAD_ARCHIVE_PHOTO = {
  file: "Roddy Road covered bridge near Thurmont in Frederick County, Maryland, built about 1850.jpg",
  objectPosition: "50% 58%",
  review: {
    reviewed_on: "2026-11-24",
    sha256: "0665d00fb90696ad15ff354ac1249b276310d653f2b1f4822124012f29c02daf",
    source_rendition: "https://tile.loc.gov/image-services/iiif/service:pnp:highsm:13500:13530/full/pct:25/0/default.jpg",
    // The Library gives only a range. Do not publish a synthetic capture date.
    capture_period: "between 1980 and 2006",
    reproduction_number: "LC-DIG-highsm-13530",
  },
  image: {
    src: "/history-photos/roddy-road-covered-bridge.jpg",
    alt: "The red timber entrance of Roddy Road Covered Bridge near Thurmont, with trees visible through the far opening.",
    creator: "Carol M. Highsmith",
    source_url: "https://www.loc.gov/item/2011631724/",
    license: { label: "Public domain", url: "https://guides.loc.gov/p-and-p-rights-and-restrictions/rights#482_high.html" },
    modifications: "The Library of Congress 25% JPEG rendition is stored byte-for-byte. The source transparency was digitized by the photographer. Display may crop.",
    edited: true,
  },
} as const;
