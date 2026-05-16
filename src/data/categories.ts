export type Category = {
  slug: string;
  name: string;
  parent?: string;
  icon: string;
  color: string;
  display_order: number;
  blurb: string;
};

export const CATEGORIES: Category[] = [
  { slug: "food", name: "Food & Drink", icon: "Utensils", color: "#C4451C", display_order: 10, blurb: "Restaurants, cafes, bars, breweries — all open-now aware." },
  { slug: "restaurant", name: "Restaurants", parent: "food", icon: "UtensilsCrossed", color: "#C4451C", display_order: 11, blurb: "Sit-down restaurants from quick to refined." },
  { slug: "coffee", name: "Coffee", parent: "food", icon: "Coffee", color: "#8B5A2B", display_order: 12, blurb: "Cafes, roasters, third-wave spots, and quick-stop shops." },
  { slug: "bar", name: "Bars", parent: "food", icon: "Wine", color: "#7E1F1F", display_order: 13, blurb: "Cocktail bars, pubs, dives, and tap rooms." },
  { slug: "brewery", name: "Breweries", parent: "food", icon: "Beer", color: "#D9A441", display_order: 14, blurb: "Independent local brewers, tap rooms, and beer gardens." },
  { slug: "bakery", name: "Bakeries", parent: "food", icon: "Cookie", color: "#B26B00", display_order: 15, blurb: "Pastry, bread, and the morning rituals worth the line." },
  { slug: "pizza", name: "Pizza", parent: "food", icon: "Pizza", color: "#C4451C", display_order: 16, blurb: "Pies from quick slice to wood-fired." },
  { slug: "food-truck", name: "Food Trucks", parent: "food", icon: "Truck", color: "#C4451C", display_order: 17, blurb: "Frederick's food trucks rotate weekly — here's where they reliably park, plus the festivals built around them." },

  { slug: "outdoors", name: "Outdoors", icon: "Trees", color: "#1E6B3A", display_order: 20, blurb: "Parks, trails, water, and views." },
  { slug: "park", name: "Parks", parent: "outdoors", icon: "Trees", color: "#1E6B3A", display_order: 21, blurb: "Public parks across all 12 municipalities and the county." },
  { slug: "trail", name: "Trails", parent: "outdoors", icon: "Mountain", color: "#1E3A2F", display_order: 22, blurb: "200+ miles of hikes, towpaths, and rail-trails." },
  { slug: "playground", name: "Playgrounds", parent: "outdoors", icon: "ToyBrick", color: "#1E6B3A", display_order: 23, blurb: "Where to take the kids when it's nice out." },

  { slug: "arts", name: "Arts & Culture", icon: "Palette", color: "#7E2C6F", display_order: 30, blurb: "Galleries, theaters, museums, and live performance." },
  { slug: "museum", name: "Museums", parent: "arts", icon: "Landmark", color: "#5B1E55", display_order: 31, blurb: "Civil War, civic history, science, and art." },
  { slug: "gallery", name: "Galleries", parent: "arts", icon: "ImageIcon", color: "#7E2C6F", display_order: 32, blurb: "Independent art spaces and First Friday venues." },
  { slug: "theater", name: "Theaters", parent: "arts", icon: "Theater", color: "#5B1E55", display_order: 33, blurb: "Stage, film, and live performance venues." },
  { slug: "music", name: "Live Music", parent: "arts", icon: "Music", color: "#7E2C6F", display_order: 34, blurb: "Venues, regular nights, and outdoor stages." },
  { slug: "public-art", name: "Public Art", parent: "arts", icon: "Palette", color: "#9B3F8A", display_order: 35, blurb: "Murals, sculptures, and installations out in the open." },

  { slug: "family", name: "Family", icon: "Baby", color: "#D9A441", display_order: 40, blurb: "Kid-friendly places, family-rated events, indoor rainy-day picks." },
  { slug: "library", name: "Libraries", parent: "family", icon: "Library", color: "#2A5D8F", display_order: 41, blurb: "County branches, story times, free wifi, and community rooms." },

  { slug: "shopping", name: "Shopping", icon: "ShoppingBag", color: "#B26B00", display_order: 50, blurb: "Boutique, antique, and Main Street commerce." },
  { slug: "antiques", name: "Antiques", parent: "shopping", icon: "Lamp", color: "#8B5A2B", display_order: 51, blurb: "Twelve blocks of New Market and beyond." },
  { slug: "book-store", name: "Book Stores", parent: "shopping", icon: "BookOpen", color: "#8B5A2B", display_order: 52, blurb: "Independent booksellers." },
  { slug: "market", name: "Markets", parent: "shopping", icon: "Apple", color: "#1E6B3A", display_order: 53, blurb: "Farmers markets, makers markets, seasonal events." },

  { slug: "wellness", name: "Wellness", icon: "Heart", color: "#A02929", display_order: 60, blurb: "Yoga, fitness, spas, and outdoor wellness." },
  { slug: "yoga", name: "Yoga & Fitness", parent: "wellness", icon: "Activity", color: "#A02929", display_order: 61, blurb: "Studios, gyms, and group classes." },

  { slug: "civic", name: "Civic & Public", icon: "Building2", color: "#2A5D8F", display_order: 70, blurb: "Government services, public buildings, civic infrastructure." },
  { slug: "government", name: "Government", parent: "civic", icon: "Building", color: "#2A5D8F", display_order: 71, blurb: "City and county government buildings and services." },
  { slug: "public-safety", name: "Public Safety", parent: "civic", icon: "ShieldCheck", color: "#A02929", display_order: 72, blurb: "Police, fire, and emergency services." },
  { slug: "voting", name: "Voting", parent: "civic", icon: "Vote", color: "#2A5D8F", display_order: 73, blurb: "Election day and early voting centers." },

  { slug: "services", name: "Services", icon: "Wrench", color: "#4A4A48", display_order: 80, blurb: "Pharmacy, hardware, post, and other practical needs." },
  { slug: "pharmacy", name: "Pharmacies", parent: "services", icon: "Pill", color: "#1E6B3A", display_order: 81, blurb: "Independent and chain pharmacies." },
  { slug: "hardware", name: "Hardware", parent: "services", icon: "Hammer", color: "#4A4A48", display_order: 82, blurb: "Hardware, lumber, and home supply." },

  { slug: "lodging", name: "Lodging", icon: "Hotel", color: "#5B1E55", display_order: 90, blurb: "Hotels, B&Bs, and farm stays." },

  { slug: "transit", name: "Transit", icon: "Train", color: "#2A5D8F", display_order: 95, blurb: "TransIT bus, MARC rail, and stations." },
  { slug: "parking", name: "Parking", icon: "ParkingCircle", color: "#4A4A48", display_order: 96, blurb: "Garages, lots, and street parking guidance." },

  // Public-infrastructure amenities (mapped from OpenStreetMap tags; stable)
  { slug: "amenities", name: "Amenities", icon: "PinCircle", color: "#2A5D8F", display_order: 100, blurb: "Restrooms, water, dog stations, benches, picnic, bike parking — out in public." },
  { slug: "restroom", name: "Public restrooms", parent: "amenities", icon: "DoorOpen", color: "#2A5D8F", display_order: 101, blurb: "Public restrooms in parks, libraries, and downtown." },
  { slug: "water", name: "Drinking water", parent: "amenities", icon: "Droplets", color: "#2A5D8F", display_order: 102, blurb: "Public drinking fountains and water bottle refill points." },
  { slug: "trash", name: "Trash receptacles", parent: "amenities", icon: "Trash2", color: "#4A4A48", display_order: 103, blurb: "Public trash cans (we map them where OSM has them tagged)." },
  { slug: "recycling", name: "Recycling drop-offs", parent: "amenities", icon: "Recycle", color: "#1E6B3A", display_order: 104, blurb: "Glass, plastic, paper, and yard-waste drop-offs." },
  { slug: "dog-waste", name: "Dog waste stations", parent: "amenities", icon: "PawPrint", color: "#1E6B3A", display_order: 105, blurb: "Dog-bag dispensers and waste bins." },
  { slug: "wifi", name: "Public WiFi", parent: "amenities", icon: "Wifi", color: "#2A5D8F", display_order: 106, blurb: "Free public internet — libraries, parks, and spots that publish open WiFi." },
  { slug: "bench", name: "Benches", parent: "amenities", icon: "Armchair", color: "#7A7975", display_order: 106, blurb: "Public seating along trails and in parks." },
  { slug: "picnic", name: "Picnic areas", parent: "amenities", icon: "Utensils", color: "#1E6B3A", display_order: 107, blurb: "Picnic tables, shelters, and grilling spots." },
  { slug: "bike-parking", name: "Bike parking", parent: "amenities", icon: "Bike", color: "#2A5D8F", display_order: 108, blurb: "Bike racks and corrals." },
  { slug: "bike-repair", name: "Bike repair stations", parent: "amenities", icon: "Wrench", color: "#2A5D8F", display_order: 109, blurb: "Public fix-it stations with tools and air pumps." },
  { slug: "defibrillator", name: "Defibrillators (AED)", parent: "amenities", icon: "HeartPulse", color: "#A02929", display_order: 110, blurb: "Publicly accessible automated external defibrillators." },
  { slug: "shelter", name: "Shelters", parent: "amenities", icon: "Tent", color: "#4A4A48", display_order: 111, blurb: "Trail shelters, bus stops, and rain refuge." },
];

export const CATEGORY_BY_SLUG = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c])
) as Record<string, Category>;

export const TOP_CATEGORIES = CATEGORIES.filter((c) => !c.parent);
