/**
 * Wikimedia Commons photos for curated places.
 *
 * Photos must be verified-real on Wikimedia Commons. Each entry's URL
 * SHOULD return HTTP 200 from:
 *   https://commons.wikimedia.org/wiki/Special:FilePath/{file}?width={N}
 *
 * Mark each entry with a `verified` flag. Do not add unverified entries —
 * 404s create broken-image UX. Use `getLandmarkPhoto(slug)` to lookup;
 * unknown slugs return null and the PlaceCard falls back to a gradient
 * + category glyph automatically.
 *
 * If you want to add an image: search https://commons.wikimedia.org for
 * the location, copy the exact File:... name, verify the Special:FilePath
 * URL returns 200, then add an entry below with verified:true.
 */

export type WikimediaPhoto = {
  file: string;
  alt: string;
  author: string;
  license: string;
  source_url: string;
  verified: boolean;
  /** When true, this curated photo WINS over the place's Google photo in
   *  PlaceHero — for landmarks whose Google hero is wrong or weak (verified by
   *  eye, per-place). Default/omitted: the Google photo wins and this only
   *  fills the gap when there is none. */
  preferCurated?: boolean;
};

// Curated Creative-Commons / public-domain establishing photos for marquee
// county landmarks that have NO Google photo (so the detail hero would
// otherwise fall back to the designed gradient plate). A real Google photo of
// the business still wins over these in PlaceHero — they only fill the gap.
// Every File:... below was fetched from the Commons API for its license/author
// and its Special:FilePath URL confirmed HTTP 200 image/jpeg (2026-06-20).
export const LANDMARK_PHOTOS: Record<string, WikimediaPhoto> = {
  "carroll-creek-linear-park-frederick": {
    file: "Carroll Creek Park Frederick MD1.jpg",
    alt: "Carroll Creek Linear Park in downtown Frederick — the landscaped creek promenade and footbridges.",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Carroll_Creek_Park_Frederick_MD1.jpg",
    verified: true,
  },
  "cunningham-falls-state-park-thurmont": {
    file: "Cunningham Falls.jpg",
    alt: "Cunningham Falls cascading over the rocks at Cunningham Falls State Park near Thurmont.",
    author: "Alyson Hurt",
    license: "CC BY 2.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Cunningham_Falls.jpg",
    verified: true,
  },
  "francis-scott-key-memorial-foundation": {
    file: "Francis Scott Key Monument (March 2024).jpg",
    alt: "The Francis Scott Key Monument at Mount Olivet Cemetery in Frederick.",
    author: "Engineerchange",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Francis_Scott_Key_Monument_(March_2024).jpg",
    verified: true,
  },
  "roddy-road-park-thurmont": {
    file: "Roddy Road covered bridge near Thurmont in Frederick County, Maryland, built about 1850.jpg",
    alt: "The 1850 Roddy Road Covered Bridge at Roddy Road Park near Thurmont.",
    author: "Carol M. Highsmith",
    license: "Public domain",
    source_url:
      "https://commons.wikimedia.org/wiki/File:Roddy_Road_covered_bridge_near_Thurmont_in_Frederick_County,_Maryland,_built_about_1850.jpg",
    verified: true,
  },

  // preferCurated — these places HAVE a Google hero, but it's wrong or weak
  // (checked by eye 2026-06-20), so the curated landmark shot wins instead.
  "barbara-fritchie-house-frederick": {
    file: "Barbara Fritchie House MD1.jpg",
    alt: "The brick Barbara Fritchie House in downtown Frederick, flag at the eaves.",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Barbara_Fritchie_House_MD1.jpg",
    verified: true,
    // Google hero is dominated by a directional park sign, not the house.
    preferCurated: true,
  },
  "catoctin-furnace-thurmont": {
    file: "Catoctin Iron Furnace copy.jpg",
    alt: "The stone Catoctin Iron Furnace ruins and casting shed near Thurmont.",
    author: "G Wayne Rhodes",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Catoctin_Iron_Furnace_copy.jpg",
    verified: true,
    // Google hero is a waterfall, not the iron furnace (misattributed).
    preferCurated: true,
  },
};

export function wikimediaUrl(file: string, width = 1200): string {
  const encoded = encodeURIComponent(file);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

export function getLandmarkPhoto(slug: string): WikimediaPhoto | null {
  const p = LANDMARK_PHOTOS[slug];
  return p && p.verified ? p : null;
}
