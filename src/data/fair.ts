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

// Placeholder data for the 9 days of the fair
export const FAIR_DAYS: FairDay[] = [
  {
    date: "2026-09-18",
    theme: "Opening Day / Kids Day",
    admission_special: "Kids under 18 free until 5 PM",
    grandstand_headline: "Demolition Derby",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-19",
    theme: "Agriculture Day",
    admission_special: "Regular Admission",
    grandstand_headline: "Jon Pardi",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-20",
    theme: "Family Day",
    admission_special: "Regular Admission",
    grandstand_headline: "Lainey Wilson",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-21",
    theme: "Senior Citizen Day",
    admission_special: "Seniors 65+ free until 3 PM",
    grandstand_headline: "Truck & Tractor Pull",
    grandstand_time: "6:30 PM",
  },
  {
    date: "2026-09-22",
    theme: "Military Appreciation Day",
    admission_special: "Active Military / Veterans free with ID",
    grandstand_headline: "Figure 8 Demolition Derby",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-23",
    theme: "First Responders Day",
    admission_special: "First Responders free with ID",
    grandstand_headline: "Cody Johnson",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-24",
    theme: "Community Day",
    admission_special: "Regular Admission",
    grandstand_headline: "Halestorm",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-25",
    theme: "4-H & FFA Day",
    admission_special: "Regular Admission",
    grandstand_headline: "Jelly Roll",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-26",
    theme: "Closing Day",
    admission_special: "Regular Admission",
    grandstand_headline: "Championship Demolition Derby",
    grandstand_time: "7:00 PM",
  },
];

export type FairPOI = {
  id: string;
  name: string;
  type: "food" | "attraction" | "utility";
  geom: LngLat;
  description?: string;
};

// Approximate locations within the Frederick Fairgrounds
export const FAIR_MAP_POIS: FairPOI[] = [
  {
    id: "grandstand",
    name: "The Grandstand",
    type: "attraction",
    geom: { lng: -77.3915, lat: 39.4140 },
    description: "Concerts, Demolition Derby, and Motorsports",
  },
  {
    id: "dairy-bar",
    name: "The Dairy Bar",
    type: "food",
    geom: { lng: -77.3920, lat: 39.4150 },
    description: "Famous fair milkshakes and ice cream",
  },
  {
    id: "hemps-meats",
    name: "Hemp's Meats",
    type: "food",
    geom: { lng: -77.3930, lat: 39.4145 },
    description: "Pit beef, ham, and turkey",
  },
  {
    id: "midway",
    name: "The Midway",
    type: "attraction",
    geom: { lng: -77.3940, lat: 39.4135 },
    description: "Carnival rides and games",
  },
  {
    id: "agri-plex",
    name: "Null Bldg / Agri-Plex",
    type: "attraction",
    geom: { lng: -77.3905, lat: 39.4155 },
    description: "Vendor exhibits and agriculture displays",
  },
  {
    id: "beef-barn",
    name: "Beef & Dairy Barn",
    type: "attraction",
    geom: { lng: -77.3910, lat: 39.4165 },
    description: "Livestock exhibits",
  },
  {
    id: "gate-1",
    name: "Gate 1 (Main Entrance)",
    type: "utility",
    geom: { lng: -77.3955, lat: 39.4125 },
  },
  {
    id: "restrooms-midway",
    name: "Restrooms (Midway)",
    type: "utility",
    geom: { lng: -77.3935, lat: 39.4130 },
  }
];
