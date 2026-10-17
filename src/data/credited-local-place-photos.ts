/** Licensed photographs reviewed for these exact catalog places.
 * Keep their public source, license and change records when reusing local bytes.
 * This small module is client-safe; it does not import the History collection. */
export const CREDITED_LOCAL_PLACE_PHOTOS = {
  "schifferstadt-architectural-museum-frederick": {
    file: "Schifferstadt_House_and_Architectural_Museum.JPG",
    image: {
      src: "/history-photos/schifferstadt.jpg",
      alt: "Schifferstadt, a 1758 German colonial stone farmhouse with one wing painted red, in Frederick, MD",
      creator: "Pete Giove-Fourwinds",
      source_url: "https://commons.wikimedia.org/wiki/File:Schifferstadt_House_and_Architectural_Museum.JPG",
      license: { label: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
      modifications: "Resized and converted for display; cards may crop the image responsively.",
    },
  },
  "hessian-barracks-frederick-maryland": {
    file: "Hessian_Barracks_MD1.jpg",
    image: {
      src: "/history-photos/hessian-barracks.jpg",
      alt: "The Hessian Barracks, a long two-story 1777 fieldstone military barracks with white wooden balconies, in Frederick, MD",
      creator: "Acroterion",
      source_url: "https://commons.wikimedia.org/wiki/File:Hessian_Barracks_MD1.jpg",
      license: { label: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      modifications: "Resized and converted for display; cards may crop the image responsively.",
    },
  },
  "co-canal-lock-30-brunswick": {
    file: "C&O_Canal_Lock_30_West_Side_Brunswick_Maryland.jpg",
    image: {
      src: "/history-photos/co-canal.jpg",
      alt: "The stone walls of Lock 30 on the Chesapeake & Ohio Canal at Brunswick, MD, surrounded by greenery",
      creator: "Deanlaw",
      source_url: "https://commons.wikimedia.org/wiki/File:C%26O_Canal_Lock_30_West_Side_Brunswick_Maryland.jpg",
      license: { label: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
      modifications: "Resized and converted for display; cards may crop the image responsively.",
    },
  },
  "brewers-alley-frederick": {
    file: "Downtown_frederick_maryland.jpg",
    provenance: {
      title: "Brewer's Alley, Frederick",
      original_source_url: "https://www.flickr.com/photos/54555810@N00/374477611/",
      original_file_url: "https://upload.wikimedia.org/wikipedia/commons/5/59/Downtown_frederick_maryland.jpg",
      captured_on: "2004-10-26",
      sha256: "c658a191257a37116c83a02aeac5cb41ac1236d8fc9850882774810bcffbd5ec",
    },
    image: {
      src: "/place-photos/brewers-alley-2004.jpg",
      alt: "Brewer's Alley side entrance, patio and arch sign in Frederick, photographed in 2004",
      creator: "Stacy (Rambling Traveler)",
      source_url: "https://commons.wikimedia.org/wiki/File:Downtown_frederick_maryland.jpg",
      license: { label: "CC BY-SA 2.0", url: "https://creativecommons.org/licenses/by-sa/2.0/" },
      modifications: '"Brewer\'s Alley, Frederick". Side alley exterior, October 26, 2004. Original file unchanged; display may resize or crop.',
    },
  },
} as const;
