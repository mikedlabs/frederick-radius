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
    theme: "Opening Day",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Daughtry",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-19",
    theme: "Saturday",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Pop 2000 Tour",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-20",
    theme: "Sunday",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Neal McCoy",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-21",
    theme: "Senior Citizen Day / Canned Food Day",
    admission_special: "Seniors 65+ free until 3 PM / $5 Admission w/ canned food",
    grandstand_headline: "Tractor & Truck Pull",
    grandstand_time: "6:30 PM",
  },
  {
    date: "2026-09-22",
    theme: "Senior Citizen Day / Carload Special",
    admission_special: "Seniors 65+ free until 3 PM / $60 per vehicle",
    grandstand_headline: "Demolition Derby",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-23",
    theme: "Senior Citizen & Military Day",
    admission_special: "Seniors free until 3 PM / Military free until 6 PM",
    grandstand_headline: "Demolition Derby",
    grandstand_time: "7:00 PM",
  },
  {
    date: "2026-09-24",
    theme: "Thursday / Lunch Bunch",
    admission_special: "Free admission 11 AM - 2 PM",
    grandstand_headline: "Danny Gokey",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-25",
    theme: "Kid's Day",
    admission_special: "18 & under free until 5 PM",
    grandstand_headline: "Let's Sing Taylor",
    grandstand_time: "7:30 PM",
  },
  {
    date: "2026-09-26",
    theme: "Closing Day",
    admission_special: "Kids 10 & under free",
    grandstand_headline: "Warren Zeiders",
    grandstand_time: "7:30 PM",
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
