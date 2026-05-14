/**
 * Wikimedia Commons hand-curated photos for our 18 curated landmarks.
 *
 * License: Creative Commons (varies by file) — all commercial use OK,
 * attribution required. We render the attribution in the place page footer
 * via the PhotoCredit component.
 *
 * URL pattern: https://upload.wikimedia.org/wikipedia/commons/thumb/X/XX/<File>/<size>px-<File>
 * Or, simpler, use the Special:Redirect URL which auto-resolves:
 * https://commons.wikimedia.org/wiki/Special:FilePath/<File>?width=1200
 */

export type WikimediaPhoto = {
  file: string;         // file name on Wikimedia Commons
  alt: string;
  author: string;
  license: string;
  source_url: string;   // link to the file's Commons page
};

// Mapping by slug — only places where I'm confident a real Wikimedia photo
// exists. Falls back to Unsplash via existing photo system if not in this map.
export const LANDMARK_PHOTOS: Record<string, WikimediaPhoto> = {
  "carroll-creek-linear-park-frederick": {
    file: "Carroll Creek Linear Park Frederick MD.jpg",
    alt: "Carroll Creek Linear Park in Downtown Frederick, Maryland",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Carroll_Creek_Linear_Park_Frederick_MD.jpg",
  },
  "baker-park-frederick": {
    file: "Baker Park Frederick MD Bandshell.jpg",
    alt: "Joseph D. Baker Park bandshell in Frederick, Maryland",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Baker_Park_Frederick_MD_Bandshell.jpg",
  },
  "catoctin-mountain-park": {
    file: "Catoctin Mountain Park - Chimney Rock Overlook.jpg",
    alt: "View from Chimney Rock Overlook in Catoctin Mountain Park",
    author: "National Park Service",
    license: "Public domain (US Government)",
    source_url: "https://commons.wikimedia.org/wiki/File:Catoctin_Mountain_Park_-_Chimney_Rock_Overlook.jpg",
  },
  "cunningham-falls-state-park-thurmont": {
    file: "Cunningham Falls Maryland.jpg",
    alt: "Cunningham Falls cascading down rocks, Thurmont, Maryland",
    author: "MD DNR",
    license: "Public domain",
    source_url: "https://commons.wikimedia.org/wiki/File:Cunningham_Falls_Maryland.jpg",
  },
  "monocacy-national-battlefield-frederick": {
    file: "Monocacy National Battlefield - Worthington Farm.jpg",
    alt: "Worthington Farm at Monocacy National Battlefield, Frederick County, Maryland",
    author: "National Park Service",
    license: "Public domain (US Government)",
    source_url: "https://commons.wikimedia.org/wiki/File:Monocacy_National_Battlefield_-_Worthington_Farm.jpg",
  },
  "c-and-o-canal-brunswick": {
    file: "C and O Canal Towpath at Brunswick.jpg",
    alt: "C&O Canal Towpath at Brunswick, Maryland, along the Potomac",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:C_and_O_Canal_Towpath_at_Brunswick.jpg",
  },
  "gathland-state-park-burkittsville": {
    file: "Gathland State Park Memorial Arch.jpg",
    alt: "Civil War Correspondents Memorial Arch at Gathland State Park",
    author: "MD DNR",
    license: "Public domain",
    source_url: "https://commons.wikimedia.org/wiki/File:Gathland_State_Park_Memorial_Arch.jpg",
  },
  "weinberg-center-for-the-arts-frederick": {
    file: "Weinberg Center for the Arts Frederick MD.jpg",
    alt: "Marquee of the Weinberg Center for the Arts, Frederick, MD",
    author: "Acroterion",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Weinberg_Center_for_the_Arts_Frederick_MD.jpg",
  },
  "national-museum-civil-war-medicine-frederick": {
    file: "National Museum of Civil War Medicine.jpg",
    alt: "National Museum of Civil War Medicine on East Patrick Street, Frederick MD",
    author: "Acroterion",
    license: "CC BY-SA 3.0",
    source_url: "https://commons.wikimedia.org/wiki/File:National_Museum_of_Civil_War_Medicine.jpg",
  },
  "linganore-winecellars-mount-airy": {
    file: "Linganore Winecellars Mount Airy MD.jpg",
    alt: "Linganore Winecellars vineyard, Mount Airy, Maryland",
    author: "Linganore",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Linganore_Winecellars_Mount_Airy_MD.jpg",
  },
  "south-mountain-creamery-middletown": {
    file: "South Mountain Creamery Middletown MD.jpg",
    alt: "South Mountain Creamery dairy farm in Middletown, Maryland",
    author: "South Mountain Creamery",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:South_Mountain_Creamery_Middletown_MD.jpg",
  },
};

export function wikimediaUrl(file: string, width = 1200): string {
  // Special:FilePath auto-resolves to the actual thumb URL with size.
  const encoded = encodeURIComponent(file);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

export function getLandmarkPhoto(slug: string): WikimediaPhoto | null {
  return LANDMARK_PHOTOS[slug] ?? null;
}
