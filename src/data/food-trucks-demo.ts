/**
 * Demo food trucks for the map preview.
 *
 * This is sample data, not a live feed. The names are real Frederick
 * trucks and the positions are plausible parking spots downtown, chosen
 * so the preview reads true on the map. Every surface that renders this
 * data labels it as a preview, so it never implies a live partnership or
 * a real-time location fix.
 *
 * When a real ingestion source exists (partner submissions, a vendor
 * feed, or scheduled parking calendars), this static set is replaced by
 * that source behind the same demo switcher. Nothing else has to change.
 */

export type DemoFoodTruck = {
  id: string;
  name: string;
  cuisine: string;
  lng: number;
  lat: number;
  /** A real Frederick spot trucks reliably park, shown as a field. */
  spot: string;
  /** Closing time for the day, shown as a structured field, not prose. */
  hereUntil: string;
  /** Three illustrative menu highlights for the card. */
  menu: readonly [string, string, string];
};

export const DEMO_FOOD_TRUCKS: readonly DemoFoodTruck[] = [
  {
    id: "cluck-n-cleaver",
    name: "Cluck N Cleaver",
    cuisine: "Rotisserie chicken",
    lng: -77.4086,
    lat: 39.4135,
    spot: "Carroll Creek Linear Park",
    hereUntil: "8:00 PM",
    menu: ["Rotisserie half chicken", "Chicken sandwich", "Garlic potatoes"],
  },
  {
    id: "hippie-chickpea",
    name: "The Hippie Chickpea",
    cuisine: "Vegan comfort food",
    lng: -77.424,
    lat: 39.4171,
    spot: "Baker Park bandshell",
    hereUntil: "7:00 PM",
    menu: ["Loaded nachos", "Buffalo cauliflower wrap", "Sweet potato fries"],
  },
  {
    id: "gypsy-pizza",
    name: "Gypsy Pizza",
    cuisine: "Wood-fired pizza",
    lng: -77.4103,
    lat: 39.416,
    spot: "Everedy Square",
    hereUntil: "9:00 PM",
    menu: ["Margherita", "Soppressata", "Garlic knots"],
  },
  {
    id: "curbside-q",
    name: "Curbside Q",
    cuisine: "Texas-style barbecue",
    lng: -77.4091,
    lat: 39.415,
    spot: "Olde Mother Brewing",
    hereUntil: "8:30 PM",
    menu: ["Brisket plate", "Pulled pork sandwich", "Smoked wings"],
  },
  {
    id: "ay-caliente",
    name: "Ay Caliente",
    cuisine: "Tacos and burritos",
    lng: -77.4076,
    lat: 39.4146,
    spot: "East Street lot",
    hereUntil: "9:00 PM",
    menu: ["Al pastor tacos", "Carne asada burrito", "Elote"],
  },
];
