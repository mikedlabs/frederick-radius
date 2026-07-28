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
    label: "Decide & discover",
    description: "Choose, search, and make a plan.",
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
    description: "Meals, drinks, deals, and mobile kitchens.",
    toolIds: [
      "reserve",
      "brunch",
      "happy-hour",
      "deals",
      "food-trucks",
      "beer-tools",
    ],
  },
  {
    id: "events",
    label: "Events & recreation",
    description: "What is happening and where to get outside.",
    toolIds: [
      "events",
      "event-calendar",
      "check-a-date",
      "live-music",
      "sports",
      "parks",
      "trails",
    ],
  },
  {
    id: "getting-around",
    label: "Getting around",
    description: "Open maps, parking, transit, and road cameras.",
    toolIds: [
      "county-map",
      "parking",
      "transit",
      "road-cameras",
      "amenities-guide",
    ],
  },
  {
    id: "amenities",
    label: "Public amenities",
    description:
      "Find practical things nearby, including water and trash cans.",
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
    label: "Live conditions & safety",
    description: "Current public conditions and trusted help.",
    toolIds: [
      "county-pulse",
      "scanner",
      "rivers",
      "overhead",
      "emergency",
      "emergency-vet",
      "civic-signals",
    ],
  },
  {
    id: "community",
    label: "Community & services",
    description: "Places, towns, contacts, and local organizations.",
    toolIds: [
      "shipping",
      "contacts",
      "nonprofits",
      "places",
      "towns",
    ],
  },
  {
    id: "stories",
    label: "Frederick stories & data",
    description: "History, archives, aerial views, and county numbers.",
    toolIds: [
      "markers",
      "history",
      "archive",
      "dear-frederick",
      "from-above-preview",
      "numbers",
      "rhythm",
    ],
  },
  {
    id: "yours",
    label: "Yours & contribute",
    description: "Saved items, settings, and ways to improve Radius.",
    toolIds: [
      "saved",
      "settings",
      "notifications",
      "mark-a-spot",
      "add-event",
      "add-place",
    ],
  },
] as const;

export type ToolDeckGroupId =
  (typeof TOOL_DECK_GROUP_DEFINITIONS)[number]["id"];

export type ToolDeckSuggestion = {
  id: string;
  reason: string;
};

export type ToolDeckMoment = {
  label: string;
  suggestions: ToolDeckSuggestion[];
};

const TIMELESS_TOOL_DECK_MOMENT: ToolDeckMoment = {
  label: "Useful now",
  suggestions: [
    { id: "events", reason: "See what is on the calendar" },
    { id: "county-map", reason: "Open the practical county map" },
    { id: "parking", reason: "Plan before you drive" },
    { id: "open-now", reason: "Check posted business hours" },
  ],
};

function frederickClock(now: Date): { hour: number; weekend: boolean } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const weekday =
    parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  return { hour, weekend: weekday === "Sat" || weekday === "Sun" };
}

/**
 * A calm, deterministic first pass at useful-now ranking. These rules only
 * use Frederick local time, so they never imply that a feed is live, a place
 * is open, or the user's location is known. Feed-backed reasons can replace
 * these candidates later without changing the Tool Deck UI contract.
 */
export function toolDeckMoment(now: Date | null): ToolDeckMoment {
  if (!now || !Number.isFinite(now.getTime())) {
    return {
      ...TIMELESS_TOOL_DECK_MOMENT,
      suggestions: TIMELESS_TOOL_DECK_MOMENT.suggestions.map((suggestion) => ({
        ...suggestion,
      })),
    };
  }

  const { hour, weekend } = frederickClock(now);

  if (weekend && hour >= 7 && hour < 14) {
    return {
      label: "Weekend morning",
      suggestions: [
        { id: "brunch", reason: "Check posted weekend brunch hours" },
        { id: "events", reason: "See what is happening today" },
        { id: "trails", reason: "Browse a daytime trail" },
        { id: "plan", reason: "Build an outing you can edit" },
        { id: "county-pulse", reason: "Check current county conditions" },
      ],
    };
  }

  if (hour >= 6 && hour < 11) {
    return {
      label: "This morning",
      suggestions: [
        { id: "transit", reason: "Check routes and schedules" },
        { id: "parking", reason: "Plan before you drive" },
        { id: "open-now", reason: "Check posted morning hours" },
        { id: "county-pulse", reason: "Check current county conditions" },
        { id: "nearby", reason: "Find something useful close by" },
      ],
    };
  }

  if (hour >= 11 && hour < 16) {
    return {
      label: "This afternoon",
      suggestions: [
        { id: "open-now", reason: "Check posted hours for right now" },
        { id: "nearby", reason: "Find something useful close by" },
        { id: "events", reason: "See what starts later today" },
        { id: "food-trucks", reason: "Check published truck stops" },
        { id: "parking", reason: "Plan before you drive" },
      ],
    };
  }

  if (hour >= 16 && hour < 21) {
    return {
      label: "Tonight",
      suggestions: [
        { id: "events", reason: "Browse tonight's listings" },
        { id: "parking", reason: "Plan before you drive downtown" },
        {
          id: weekend || hour >= 19 ? "live-music" : "happy-hour",
          reason: weekend || hour >= 19
            ? "Check published venue lineups"
            : "Check posted weekday specials",
        },
        { id: "food-trucks", reason: "Check published evening stops" },
        { id: "county-pulse", reason: "Check current county conditions" },
      ],
    };
  }

  return {
    label: "Late",
    suggestions: [
      { id: "open-now", reason: "Check which posted hours run late" },
      { id: "county-pulse", reason: "Check current county conditions" },
      { id: "road-cameras", reason: "Look at major roads before driving" },
      { id: "county-map", reason: "Open the practical county map" },
      { id: "saved", reason: "Return to saved places and plans" },
    ],
  };
}

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
