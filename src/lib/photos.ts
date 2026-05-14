/**
 * Photo strategy:
 * - We hotlink hand-picked Unsplash photo IDs by category.
 * - Photos are CDN-served from images.unsplash.com (Unsplash license permits hotlinking + commercial use; attribution recommended).
 * - When a place provides hero_image (Cloudinary / owner upload), it wins.
 * - When Yelp/Foursquare enrichment is wired, those photos take precedence over Unsplash.
 *
 * Attribution shown in PlacePhotoAttribution component on detail pages.
 */

type UnsplashPhoto = {
  id: string;
  alt: string;
  photographer: string;
  photographer_url: string;
};

// Hand-curated by category. All Unsplash, license: free for commercial use, attribution requested.
const BY_CATEGORY: Record<string, UnsplashPhoto[]> = {
  coffee: [
    { id: "PieqcLM5sFw", alt: "Cafe interior with warm light", photographer: "Nathan Dumlao", photographer_url: "https://unsplash.com/@nate_dumlao" },
    { id: "ZIPFteu-R8k", alt: "Latte art in a white mug", photographer: "Devin Avery", photographer_url: "https://unsplash.com/@devintavery" },
  ],
  restaurant: [
    { id: "N_Y88TWmGwA", alt: "Dimly lit restaurant table", photographer: "Jay Wennington", photographer_url: "https://unsplash.com/@jaywennington" },
    { id: "4_jhDO54BYg", alt: "Restaurant interior", photographer: "Patrick Tomasso", photographer_url: "https://unsplash.com/@impatrickt" },
  ],
  bar: [
    { id: "wG4tjbZzLZ4", alt: "Cocktail bar at night", photographer: "Adam Jaime", photographer_url: "https://unsplash.com/@adamjaime" },
  ],
  brewery: [
    { id: "M9eGOhdN_z0", alt: "Brewery taps", photographer: "Patrick Fore", photographer_url: "https://unsplash.com/@patrickian4" },
    { id: "MMioDOXqRG4", alt: "Beer being poured", photographer: "Pavel Sedlák", photographer_url: "https://unsplash.com/@pavel_sedlak" },
  ],
  bakery: [
    { id: "5kZqJtaTrkk", alt: "Fresh pastries in a bakery case", photographer: "Heather Ford", photographer_url: "https://unsplash.com/@heatherford" },
  ],
  pizza: [
    { id: "MQUqbmszGGM", alt: "Wood-fired pizza", photographer: "Alan Hardman", photographer_url: "https://unsplash.com/@alhardman" },
  ],
  park: [
    { id: "L7EwHkq1B2s", alt: "Wooded park trail", photographer: "John Price", photographer_url: "https://unsplash.com/@johnprice" },
    { id: "C7B-ExXpOIE", alt: "Mountain park overlook", photographer: "John Price", photographer_url: "https://unsplash.com/@johnprice" },
  ],
  trail: [
    { id: "Ie2HOh-D6fE", alt: "Forest hiking trail", photographer: "Casey Horner", photographer_url: "https://unsplash.com/@mischievous_penguins" },
  ],
  playground: [
    { id: "4Mw7nkQDByk", alt: "Empty park playground", photographer: "Aaron Burden", photographer_url: "https://unsplash.com/@aaronburden" },
  ],
  museum: [
    { id: "X_X8YlBWY8s", alt: "Museum gallery interior", photographer: "Jose Llamas", photographer_url: "https://unsplash.com/@joshhild" },
  ],
  gallery: [
    { id: "tCJ0pUtO5MQ", alt: "Art gallery walls", photographer: "Antenna", photographer_url: "https://unsplash.com/@antenna" },
  ],
  theater: [
    { id: "ZBxLcyykXSE", alt: "Empty theater seats", photographer: "Rob Laughter", photographer_url: "https://unsplash.com/@roblaughter" },
  ],
  music: [
    { id: "Egn-ftLnUtA", alt: "Live music silhouette", photographer: "Vishnu R Nair", photographer_url: "https://unsplash.com/@vishnurnair" },
  ],
  library: [
    { id: "uPLG_oyfeqw", alt: "Library reading room", photographer: "Susan Yin", photographer_url: "https://unsplash.com/@syinq" },
  ],
  market: [
    { id: "RnCPiXixooY", alt: "Farmers market stand", photographer: "ja ma", photographer_url: "https://unsplash.com/@yulokchan" },
  ],
  antiques: [
    { id: "kEgT9oj0nws", alt: "Antique shop interior", photographer: "Inja Pavlić", photographer_url: "https://unsplash.com/@injap" },
  ],
  "book-store": [
    { id: "RLw-UC03Gwc", alt: "Bookshop shelves", photographer: "Eli Francis", photographer_url: "https://unsplash.com/@elifrancis" },
  ],
  yoga: [
    { id: "F2qh3yjz6Jk", alt: "Yoga studio", photographer: "Erik Brolin", photographer_url: "https://unsplash.com/@erikbrolin" },
  ],
  lodging: [
    { id: "ZAk0qq3SrYg", alt: "Boutique hotel room", photographer: "Vojtech Bruzek", photographer_url: "https://unsplash.com/@vojtechbruzek" },
  ],
  parking: [
    { id: "M_oZAjB0JhM", alt: "Parking garage", photographer: "Aleksei Zaitcev", photographer_url: "https://unsplash.com/@alekseizaitcev" },
  ],
  "public-safety": [
    { id: "vBJlAcbjqkA", alt: "Fire station", photographer: "Matt Chesin", photographer_url: "https://unsplash.com/@mattchesin" },
  ],
  government: [
    { id: "fXls-tVemno", alt: "Government building", photographer: "Andy Feliciotti", photographer_url: "https://unsplash.com/@someguy" },
  ],
  default: [
    { id: "uxQUDh-X9V4", alt: "Frederick Maryland street view", photographer: "Susan Q Yin", photographer_url: "https://unsplash.com/@syinq" },
  ],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function photoForCategory(categorySlug: string, seed: string): UnsplashPhoto {
  const pool = BY_CATEGORY[categorySlug] ?? BY_CATEGORY.default;
  return pool[hash(seed) % pool.length];
}

export function unsplashUrl(photo: UnsplashPhoto, width: number, height?: number): string {
  const params = new URLSearchParams({
    w: width.toString(),
    auto: "format",
    fit: "crop",
    q: "75",
  });
  if (height) params.set("h", height.toString());
  return `https://images.unsplash.com/photo-${photo.id}?${params.toString()}`;
}
