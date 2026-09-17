import { LngLat } from "@/lib/geo";

// The fair typically runs for 9 days in mid-September.
export const FAIR_START_DATE = "2026-09-18T09:00:00-04:00";
export const FAIR_END_DATE = "2026-09-26T23:59:59-04:00";

// A bounding box for the fairgrounds to restrict the map view
export const FAIRGROUNDS_BBOX: [number, number, number, number] = [
  -77.3985, 39.4120, // Southwest (lng, lat)
  -77.3875, 39.4180  // Northeast (lng, lat)
];

// Center of the fairgrounds
export const FAIRGROUNDS_CENTER: LngLat = { lng: -77.3923, lat: 39.4147 };

export type FairDay = {
  date: string; // YYYY-MM-DD
  theme: string;
  admission_special: string;
  grandstand_headline: string;
  grandstand_image_url?: string;
  grandstand_time: string;
};

// Enriched data for the 9 days of the fair
export const FAIR_DAYS: FairDay[] = [
  {
    date: "2026-09-18",
    theme: "Opening Day",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Daughtry",
    grandstand_image_url: "https://images.unsplash.com/photo-1540039155732-6761b54f6738?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "8:00 PM",
  },
  {
    date: "2026-09-19",
    theme: "Saturday",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Pop 2000 Tour",
    grandstand_image_url: "https://images.unsplash.com/photo-1493225457224-2fae7a68a526?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-20",
    theme: "Sunday",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Neal McCoy",
    grandstand_image_url: "https://images.unsplash.com/photo-1510512396349-11f8b4fb91ee?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "8:00 PM",
  },
  {
    date: "2026-09-21",
    theme: "Senior Citizen Day / Canned Food Day",
    admission_special: "Seniors 65+ free until 3 PM / $5 Admission w/ canned food",
    grandstand_headline: "Tractor & Truck Pull",
    grandstand_image_url: "https://images.unsplash.com/photo-1596700688329-373f789d2ed3?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "6:00 PM",
  },
  {
    date: "2026-09-22",
    theme: "Senior Citizen Day / Carload Special",
    admission_special: "Seniors 65+ free until 3 PM / $60 per vehicle",
    grandstand_headline: "Demolition Derby",
    grandstand_image_url: "https://images.unsplash.com/photo-1563273105-021950eaf223?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-23",
    theme: "Senior Citizen & Military Day",
    admission_special: "Seniors free until 3 PM / Military free until 6 PM",
    grandstand_headline: "Demolition Derby",
    grandstand_image_url: "https://images.unsplash.com/photo-1563273105-021950eaf223?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-24",
    theme: "Thursday / Lunch Bunch",
    admission_special: "Free admission 11 AM - 2 PM",
    grandstand_headline: "Danny Gokey",
    grandstand_image_url: "https://images.unsplash.com/photo-1501612780327-45045538702b?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "8:00 PM",
  },
  {
    date: "2026-09-25",
    theme: "Kid's Day",
    admission_special: "18 & under free until 5 PM",
    grandstand_headline: "Let's Sing Taylor",
    grandstand_image_url: "https://images.unsplash.com/photo-1470229722913-7c090bdc6e18?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "6:00 PM",
  },
  {
    date: "2026-09-26",
    theme: "Closing Day",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Warren Zeiders",
    grandstand_image_url: "https://images.unsplash.com/photo-1520166946029-796fb3b664fc?q=80&w=2070&auto=format&fit=crop",
    grandstand_time: "8:00 PM",
  },
];

export type FairPOI = {
  id: string;
  name: string;
  type: "food" | "attraction" | "utility";
  geom: LngLat;
  description?: string;
};

// Expanded locations within the Frederick Fairgrounds
export const FAIR_MAP_POIS: FairPOI[] = [
  {
    id: "grandstand",
    name: "The Grandstand",
    type: "attraction",
    geom: { lng: -77.3915, lat: 39.4140 },
    description: "The primary venue for major concerts, the Demolition Derby, and Motorsports. Features both track-side seating and covered grandstands.",
  },
  {
    id: "dairy-bar",
    name: "The Dairy Bar",
    type: "food",
    geom: { lng: -77.3920, lat: 39.4150 },
    description: "Enjoy famous fair milkshakes and ice cream. A staple of the Great Frederick Fair since the 1960s.",
  },
  {
    id: "hemps-meats",
    name: "Hemp's Meats",
    type: "food",
    geom: { lng: -77.3930, lat: 39.4145 },
    description: "Famous for their pit beef, ham, and turkey sandwiches slow-roasted right on the fairgrounds.",
  },
  {
    id: "jb-seafood",
    name: "JB Seafood",
    type: "food",
    geom: { lng: -77.3925, lat: 39.4147 },
    description: "JB Seafood serves fresh crab cakes, fried shrimp, and local Maryland seafood favorites.",
  },
  {
    id: "funnel-cake-stand",
    name: "Traditional Funnel Cakes",
    type: "food",
    geom: { lng: -77.3935, lat: 39.4138 },
    description: "This stand serves classic deep-fried funnel cakes dusted with powdered sugar and topped with strawberries.",
  },
  {
    id: "midway",
    name: "The Midway",
    type: "attraction",
    geom: { lng: -77.3940, lat: 39.4135 },
    description: "The thrilling center of the fair with carnival rides ranging from the Ferris Wheel to high-speed rollercoasters and skill games.",
  },
  {
    id: "agri-plex",
    name: "Null Bldg / Agri-Plex",
    type: "attraction",
    geom: { lng: -77.3905, lat: 39.4155 },
    description: "Browse local agriculture exhibits, ribbon-winning produce, baked goods, crafts, and commercial vendors.",
  },
  {
    id: "beef-barn",
    name: "Beef & Dairy Barn",
    type: "attraction",
    geom: { lng: -77.3910, lat: 39.4165 },
    description: "See the prize-winning livestock exhibits up close and meet the 4-H farmers who raise them.",
  },
  {
    id: "swine-barn",
    name: "Swine & Sheep Barn",
    type: "attraction",
    geom: { lng: -77.3912, lat: 39.4160 },
    description: "Home to the county's finest sheep and pigs competing for the blue ribbon.",
  },
  {
    id: "gate-1",
    name: "Gate 1 (Main Entrance)",
    type: "utility",
    geom: { lng: -77.3955, lat: 39.4125 },
    description: "The primary pedestrian gate facing the city side, with ticket booths and express entry lines.",
  },
  {
    id: "restrooms-midway",
    name: "Restrooms (Midway)",
    type: "utility",
    geom: { lng: -77.3935, lat: 39.4130 },
  }
];
