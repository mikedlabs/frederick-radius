export const TOOL_DECK_PIN_LIMIT = 6;
export const TOOL_DECK_PINS_KEY = "fr.compass.pins.v1";

export const DEFAULT_TOOL_DECK_PIN_IDS = [
  "ask-radius",
  "nearby",
  "county-pulse",
  "public-essentials",
] as const;

export const TOOL_DECK_GROUP_DEFINITIONS = [
  {
    id: "decide",
    label: "Find something",
    description: "Search, see what is open, or build a plan.",
    toolIds: [
      "ask-radius",
      "search",
      "nearby",
      "open-now",
      "plan",
      "collections",
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    description: "Meals, drinks, specials, and food trucks.",
    toolIds: [
      "reserve",
      "brunch",
      "happy-hour",
      "food-trucks",
      "deals",
      "beer-tools",
    ],
  },
  {
    id: "events",
    label: "Events & outdoors",
    description: "Events, music, parks, trails, and sports.",
    toolIds: [
      "events",
      "event-calendar",
      "live-music",
      "parks",
      "check-a-date",
      "sports",
      "trails",
    ],
  },
  {
    id: "getting-around",
    label: "Get around",
    description: "Use maps, parking, transit, and road cameras.",
    toolIds: [
      "county-map",
      "mobility-map",
      "parking",
      "transit",
      "road-cameras",
      "gas-prices",
      "amenities-guide",
    ],
  },
  {
    id: "amenities",
    label: "Nearby essentials",
    description: "Find restrooms, water, trash cans, Wi-Fi, and more.",
    toolIds: [
      "public-essentials",
      "restrooms",
      "water",
      "trash-cans",
      "dog-stations",
      "public-wifi",
      "ev-charging",
      "power-outlets",
      "bike-racks",
      "seating",
      "play-areas",
    ],
  },
  {
    id: "live",
    label: "Conditions & help",
    description: "Weather, roads, public alerts, and emergency help.",
    toolIds: [
      "county-pulse",
      "scanner",
      "rivers",
      "emergency",
      "overhead",
      "emergency-vet",
      "civic-signals",
    ],
  },
  {
    id: "community",
    label: "Community services",
    description: "Contacts, nonprofits, towns, and local services.",
    toolIds: [
      "contacts",
      "places",
      "towns",
      "nonprofits",
      "communication-access",
      "shipping",
    ],
  },
  {
    id: "stories",
    label: "History & local data",
    description: "Archives, aerial views, history, and county numbers.",
    toolIds: [
      "markers",
      "history",
      "archive",
      "from-above-preview",
      "dear-frederick",
      "numbers",
      "rhythm",
    ],
  },
  {
    id: "yours",
    label: "Saved & settings",
    description: "Saved items, notifications, settings, and submissions.",
    toolIds: [
      "saved",
      "settings",
      "keep-radius",
      "notifications",
      "mark-a-spot",
      "add-event",
      "add-place",
    ],
  },
] as const;

export type ToolDeckGroupId =
  (typeof TOOL_DECK_GROUP_DEFINITIONS)[number]["id"];

export function normalizeToolDeckPins(
  value: unknown,
  availableIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TOOL_DECK_PIN_IDS.filter((id) => availableIds.has(id))
      .slice(0, TOOL_DECK_PIN_LIMIT);
  }

  const next: string[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "string" ||
      !availableIds.has(candidate) ||
      next.includes(candidate)
    ) {
      continue;
    }
    next.push(candidate);
    if (next.length === TOOL_DECK_PIN_LIMIT) break;
  }
  return next;
}
