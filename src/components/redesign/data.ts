/**
 * Curated, category-MATCHED content for the redesign mockups. Hand-picked
 * top-rated places (each with a representative photo for its category) +
 * the owner's aerials + a few real events. Shared by every redesign mock
 * so photos always match the thing they're labeling.
 */

export type RPlace = {
  slug: string;
  name: string;
  category: string;      // display label, e.g. "Coffee"
  color: string;         // category accent hex
  photo: string;
  blurb: string;
  rating: number;
  reviews: number;
  neighborhood: string;
  price: string;         // "$" | "$$" | "$$$"
  distance: string;      // e.g. "0.3 mi"
  open: boolean;
  closes: string;        // e.g. "10 PM"
};

export type REvent = {
  title: string;
  venue: string;
  day: string;           // "Tonight" | "Fri" | "Sat" ...
  time: string;          // "5:00 PM"
  category: string;
  color: string;
  photo: string;
};

export const PLACES: RPlace[] = [
  { slug: "back-street-brews-coffee-tea-house-brunswick", name: "Back Street Brews", category: "Coffee", color: "#7A5230", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/back-street-brews-coffee-tea-house-brunswick/hero.jpg", blurb: "A warm corner roaster + tea house in Brunswick.", rating: 4.9, reviews: 343, neighborhood: "Brunswick", price: "$", distance: "0.4 mi", open: true, closes: "6 PM" },
  { slug: "k-town-takeout", name: "K Town Takeout", category: "Restaurant", color: "#A8462C", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/k-town-takeout/hero.jpg", blurb: "Family-owned Korean takeout, new to Frederick.", rating: 5.0, reviews: 178, neighborhood: "Frederick", price: "$$", distance: "0.6 mi", open: true, closes: "9 PM" },
  { slug: "stone-silo-brewery-mount-airy", name: "Stone Silo Brewery", category: "Brewery", color: "#B07A1E", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/stone-silo-brewery-mount-airy/hero.jpg", blurb: "Farmhouse brewery with a wide-open taproom.", rating: 4.9, reviews: 180, neighborhood: "Mount Airy", price: "$$", distance: "11 mi", open: true, closes: "10 PM" },
  { slug: "debs-artisan-bakehouse-middletown", name: "Deb's Artisan Bakehouse", category: "Bakery", color: "#C26B3C", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/debs-artisan-bakehouse-middletown/hero.jpg", blurb: "Small-batch sourdough + pastry in Middletown.", rating: 5.0, reviews: 296, neighborhood: "Middletown", price: "$$", distance: "7 mi", open: false, closes: "3 PM" },
  { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", category: "Park", color: "#1E6B3A", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/carroll-creek-linear-park-frederick/hero.jpg", blurb: "A mile of waterway, gardens, and seasonal sailboats.", rating: 4.8, reviews: 2865, neighborhood: "Downtown", price: "Free", distance: "0.2 mi", open: true, closes: "Dusk" },
  { slug: "rivers-edge-trails-brunswick", name: "Rivers Edge Trails", category: "Trail", color: "#2E7D32", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/rivers-edge-trails-brunswick/hero.jpg", blurb: "Riverside singletrack along the Potomac.", rating: 4.9, reviews: 85, neighborhood: "Brunswick", price: "Free", distance: "9 mi", open: true, closes: "Dusk" },
  { slug: "national-museum-civil-war-medicine-frederick", name: "Civil War Medicine Museum", category: "Museum", color: "#7E2C6F", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/national-museum-civil-war-medicine-frederick/hero.jpg", blurb: "The country's only Civil War-era medicine museum.", rating: 4.7, reviews: 749, neighborhood: "Downtown", price: "$$", distance: "0.3 mi", open: true, closes: "5 PM" },
  { slug: "dream-free-art-frederick", name: "Dream Free Art", category: "Gallery", color: "#6D2A86", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/dream-free-art-frederick/hero.jpg", blurb: "An open studio + gallery in downtown Frederick.", rating: 5.0, reviews: 155, neighborhood: "Downtown", price: "Free", distance: "0.3 mi", open: true, closes: "7 PM" },
  { slug: "frederick-magic-theater-lounge-frederick", name: "Frederick Magic Theater", category: "Theater", color: "#5B2A86", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/frederick-magic-theater-lounge-frederick/hero.jpg", blurb: "Close-up magic + a cocktail lounge, downtown.", rating: 5.0, reviews: 174, neighborhood: "Downtown", price: "$$$", distance: "0.4 mi", open: true, closes: "11 PM" },
  { slug: "moon-valley-farm-woodsboro", name: "Moon Valley Farm", category: "Market", color: "#B26B00", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/moon-valley-farm-woodsboro/hero.jpg", blurb: "Regenerative farm stand + CSA in Woodsboro.", rating: 5.0, reviews: 406, neighborhood: "Woodsboro", price: "$$", distance: "12 mi", open: true, closes: "5 PM" },
  { slug: "georges-on-york-boutique-inn-emmitsburg", name: "Georges on York Inn", category: "Stay", color: "#5B1E55", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/georges-on-york-boutique-inn-emmitsburg/hero.jpg", blurb: "A boutique inn at the foot of the Catoctins.", rating: 5.0, reviews: 183, neighborhood: "Emmitsburg", price: "$$$", distance: "21 mi", open: true, closes: "—" },
  { slug: "rosatis-pizza-5", name: "Rosati's Pizza", category: "Pizza", color: "#A8462C", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/rosatis-pizza-5/hero.jpg", blurb: "Chicago-style deep dish + tavern thin crust.", rating: 4.7, reviews: 1774, neighborhood: "Frederick", price: "$$", distance: "1.2 mi", open: true, closes: "10 PM" },
];

/** The owner's geotagged aerials — for heroes, covers, and landscape moments. */
export const AERIALS: string[] = [
  "/images/seasons/summer/056.jpg",
  "/images/seasons/fall/012.jpg",
  "/images/seasons/fall/043.jpg",
  "/images/seasons/winter/WINTER 3.jpg",
  "/images/seasons/winter/WINTER NEW 8.jpg",
  "/images/seasons/summer/087.jpg",
];
export const HERO_AERIAL: string = AERIALS[1];

export const EVENTS: REvent[] = [
  { title: "Alive @ Five", venue: "Carroll Creek Amphitheater", day: "Tonight", time: "5:00 PM", category: "Live music", color: "#5B2A86", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/carroll-creek-linear-park-frederick/hero.jpg" },
  { title: "Sky Stage Open Mic", venue: "Sky Stage", day: "Fri", time: "7:00 PM", category: "Arts", color: "#6D2A86", photo: "https://ijszzixn2rzddhti.public.blob.vercel-storage.com/places/dream-free-art-frederick/hero.jpg" },
  { title: "Frederick Festival of the Arts", venue: "Carroll Creek", day: "Sat", time: "10:00 AM", category: "Festival", color: "#B26B00", photo: "/images/seasons/summer/087.jpg" },
  { title: "Color on the Creek", venue: "Carroll Creek", day: "Sun", time: "6:30 PM", category: "Community", color: "#1E6B3A", photo: "/images/seasons/fall/043.jpg" },
];
