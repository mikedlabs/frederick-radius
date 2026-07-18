export type RadiusToolIcon =
  | "activity"
  | "archive"
  | "beer"
  | "bike"
  | "bookmark"
  | "bus"
  | "calendar"
  | "calendar-check"
  | "car"
  | "coffee"
  | "compass"
  | "dog"
  | "history"
  | "landmark"
  | "map"
  | "map-pin"
  | "music"
  | "package"
  | "parking"
  | "paw"
  | "plane"
  | "plug"
  | "route"
  | "search"
  | "settings"
  | "sigma"
  | "sparkles"
  | "store"
  | "tag"
  | "toilet"
  | "trash"
  | "trees"
  | "truck"
  | "utensils"
  | "waves"
  | "wifi";

export type RadiusToolTone =
  | "accent"
  | "brand"
  | "civic"
  | "cool"
  | "positive";

export type RadiusTool = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: RadiusToolIcon;
  tone: RadiusToolTone;
  featured?: boolean;
};

export type RadiusToolGroup = {
  id: string;
  label: string;
  tools: readonly RadiusTool[];
};

/**
 * Real user actions that Frederick Radius currently ships.
 *
 * Content indexes, prototypes, admin pages, and unfinished integrations do not
 * belong here. Every item must open a working tool or a supported tool state.
 */
export const RADIUS_TOOL_GROUPS: readonly RadiusToolGroup[] = [
  {
    id: "right-now",
    label: "What you need right now",
    tools: [
      {
        id: "county-pulse",
        label: "County Pulse",
        description: "Check weather, roads, outages, schools, and public feeds.",
        href: "/pulse",
        icon: "activity",
        tone: "brand",
        featured: true,
      },
      {
        id: "open-now",
        label: "Open now",
        description: "Check posted hours and rank options from your chosen area.",
        href: "/open-now",
        icon: "activity",
        tone: "positive",
        featured: true,
      },
      {
        id: "nearby",
        label: "Nearby",
        description: "Rank useful places from a real location or chosen town.",
        href: "/nearby",
        icon: "map-pin",
        tone: "cool",
      },
      {
        id: "emergency-vet",
        label: "Emergency vet care",
        description: "Find listed emergency animal care and poison-help contacts.",
        href: "/emergency-vet",
        icon: "paw",
        tone: "brand",
      },
      {
        id: "public-essentials",
        label: "Public essentials",
        description: "Open the map for restrooms, water, trash, Wi-Fi, and more.",
        href: "/map?amenity=restroom,water,trash,dog,wifi,ev,outlet,bike,seating,play,safety",
        icon: "map-pin",
        tone: "civic",
        featured: true,
      },
    ],
  },
  {
    id: "decide",
    label: "Plan and decide",
    tools: [
      {
        id: "plan",
        label: "Plan an outing",
        description: "Build an editable route around your time and mood.",
        href: "/plan",
        icon: "route",
        tone: "accent",
        featured: true,
      },
      {
        id: "events",
        label: "Events",
        description: "See what is happening today, tonight, or later.",
        href: "/events",
        icon: "calendar",
        tone: "brand",
        featured: true,
      },
      {
        id: "event-calendar",
        label: "Event calendar",
        description: "Browse listed events on a month calendar.",
        href: "/events/calendar",
        icon: "calendar",
        tone: "brand",
      },
      {
        id: "check-a-date",
        label: "Check a date",
        description: "Review listed events before you schedule something.",
        href: "/check-a-date",
        icon: "calendar-check",
        tone: "cool",
      },
      {
        id: "reserve",
        label: "Book a table",
        description: "Open checked restaurant reservation links.",
        href: "/reserve",
        icon: "utensils",
        tone: "brand",
      },
      {
        id: "county-map",
        label: "County map",
        description: "Browse the full county map and its practical layers.",
        href: "/map?in=county",
        icon: "map",
        tone: "cool",
        featured: true,
      },
      {
        id: "parking",
        label: "Parking",
        description: "Find downtown garages and event parking guidance.",
        href: "/parking",
        icon: "parking",
        tone: "cool",
      },
      {
        id: "transit",
        label: "Transit and trains",
        description: "Review TransIT routes and MARC information.",
        href: "/transit",
        icon: "bus",
        tone: "cool",
      },
      {
        id: "contacts",
        label: "City and county contacts",
        description: "Find the right public office and its phone number.",
        href: "/contacts",
        icon: "landmark",
        tone: "civic",
      },
      {
        id: "shipping",
        label: "Post and shipping",
        description: "Find listed postal and shipping locations by town.",
        href: "/shipping",
        icon: "package",
        tone: "brand",
      },
      {
        id: "search",
        label: "Search everything",
        description: "Search places, events, towns, guides, and tools.",
        href: "/search",
        icon: "search",
        tone: "brand",
      },
    ],
  },
  {
    id: "amenities",
    label: "Map public essentials",
    tools: [
      {
        id: "amenities-guide",
        label: "Amenities guide",
        description: "Review every mapped public-amenity category.",
        href: "/amenities",
        icon: "compass",
        tone: "civic",
      },
      {
        id: "restrooms",
        label: "Restrooms",
        description: "Open the map with known public restrooms visible.",
        href: "/map?amenity=restroom",
        icon: "toilet",
        tone: "civic",
      },
      {
        id: "water",
        label: "Water",
        description: "Open the map with known public water points visible.",
        href: "/map?amenity=water",
        icon: "waves",
        tone: "cool",
      },
      {
        id: "trash-cans",
        label: "Trash cans",
        description: "Open the map with field-mapped trash cans visible.",
        href: "/map?amenity=trash",
        icon: "trash",
        tone: "civic",
      },
      {
        id: "dog-stations",
        label: "Dog stations",
        description: "Open the map with known dog-waste stations visible.",
        href: "/map?amenity=dog",
        icon: "dog",
        tone: "positive",
      },
      {
        id: "public-wifi",
        label: "Public Wi-Fi",
        description: "Open the map with known public Wi-Fi visible.",
        href: "/map?amenity=wifi",
        icon: "wifi",
        tone: "cool",
      },
      {
        id: "ev-charging",
        label: "EV charging",
        description: "Open the map with known EV charging points visible.",
        href: "/map?amenity=ev",
        icon: "car",
        tone: "positive",
      },
      {
        id: "power-outlets",
        label: "Power outlets",
        description: "Open the map with known public outlets visible.",
        href: "/map?amenity=outlet",
        icon: "plug",
        tone: "accent",
      },
      {
        id: "bike-racks",
        label: "Bike racks",
        description: "Open the map with known bike racks visible.",
        href: "/map?amenity=bike",
        icon: "bike",
        tone: "positive",
      },
      {
        id: "seating",
        label: "Public seating",
        description: "Open the map with field-mapped seating visible.",
        href: "/map?amenity=seating",
        icon: "map-pin",
        tone: "accent",
      },
      {
        id: "play-areas",
        label: "Play areas",
        description: "Open the map with known play areas visible.",
        href: "/map?amenity=play",
        icon: "sparkles",
        tone: "positive",
      },
    ],
  },
  {
    id: "yours",
    label: "Your Radius",
    tools: [
      {
        id: "saved",
        label: "Saved",
        description: "Open the places, events, and routes saved on this device.",
        href: "/my-radius",
        icon: "bookmark",
        tone: "brand",
      },
      {
        id: "settings",
        label: "Settings",
        description: "Choose your home area and tune Radius for your needs.",
        href: "/settings",
        icon: "settings",
        tone: "cool",
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Choose the local updates you want Radius to send.",
        href: "/settings/notifications",
        icon: "activity",
        tone: "brand",
      },
    ],
  },
  {
    id: "guides",
    label: "Explore Radius guides",
    tools: [
      {
        id: "brunch",
        label: "Brunch guide",
        description: "Browse weekend brunch listings with posted days and hours.",
        href: "/brunch",
        icon: "coffee",
        tone: "accent",
      },
      {
        id: "happy-hour",
        label: "Happy hour",
        description: "See checked happy-hour schedules and deal details.",
        href: "/happy-hour",
        icon: "beer",
        tone: "brand",
      },
      {
        id: "deals",
        label: "Daily deals",
        description: "Browse checked specials for the current day.",
        href: "/deals",
        icon: "tag",
        tone: "brand",
      },
      {
        id: "food-trucks",
        label: "Food trucks",
        description: "Find local mobile food vendors and their published feeds.",
        href: "/food-trucks",
        icon: "truck",
        tone: "positive",
      },
      {
        id: "live-music",
        label: "Live music",
        description: "See published venue lineups and ticketed shows.",
        href: "/live-music",
        icon: "music",
        tone: "cool",
      },
      {
        id: "places",
        label: "Places, A to Z",
        description: "Browse the full place index or switch to a map.",
        href: "/places",
        icon: "store",
        tone: "brand",
      },
      {
        id: "towns",
        label: "Towns and communities",
        description: "Choose an area and open its local guide.",
        href: "/towns",
        icon: "map-pin",
        tone: "brand",
      },
      {
        id: "parks",
        label: "Parks",
        description: "Browse parks returned by Frederick County GIS.",
        href: "/parks",
        icon: "trees",
        tone: "positive",
      },
      {
        id: "trails",
        label: "Trails",
        description: "Browse trails with available length and surface details.",
        href: "/trails",
        icon: "route",
        tone: "positive",
      },
      {
        id: "markers",
        label: "Markers and landmarks",
        description: "Read roadside markers and find registered historic sites.",
        href: "/markers",
        icon: "landmark",
        tone: "civic",
      },
      {
        id: "history",
        label: "County history",
        description: "The history guide shows dated local moments tied to real places.",
        href: "/history",
        icon: "history",
        tone: "accent",
      },
      {
        id: "nonprofits",
        label: "Nonprofits",
        description: "Browse county nonprofit records by cause.",
        href: "/nonprofits",
        icon: "landmark",
        tone: "civic",
      },
      {
        id: "collections",
        label: "Collections",
        description: "Open local shortlists for different situations.",
        href: "/collections",
        icon: "compass",
        tone: "accent",
      },
    ],
  },
  {
    id: "specialist",
    label: "Specialist tools",
    tools: [
      {
        id: "rivers",
        label: "River levels",
        description: "Read current USGS gauge data for local waterways.",
        href: "/rivers",
        icon: "waves",
        tone: "cool",
      },
      {
        id: "overhead",
        label: "Flights overhead",
        description: "See aircraft currently transmitting near Frederick.",
        href: "/overhead",
        icon: "plane",
        tone: "cool",
      },
      {
        id: "beer-tools",
        label: "Beer tools",
        description: "Match a pour, browse taprooms, and use your beer passport.",
        href: "/beer#find-your-pour",
        icon: "beer",
        tone: "accent",
      },
      {
        id: "rhythm",
        label: "The county rhythm",
        description: "See how posted business hours change through the week.",
        href: "/rhythm",
        icon: "activity",
        tone: "accent",
      },
      {
        id: "numbers",
        label: "The county, counted",
        description: "See counts calculated from the current Radius datasets.",
        href: "/numbers",
        icon: "sigma",
        tone: "cool",
      },
      {
        id: "archive",
        label: "Archive Lens",
        description: "Archive Lens shows Frederick maps, surveys, newspapers, and photographs.",
        href: "/archive",
        icon: "archive",
        tone: "accent",
      },
    ],
  },
  {
    id: "contribute",
    label: "Help improve the guide",
    tools: [
      {
        id: "mark-a-spot",
        label: "Mark a spot",
        description: "Add a useful field note to the map.",
        href: "/report",
        icon: "map-pin",
        tone: "brand",
      },
      {
        id: "add-event",
        label: "Add an event",
        description: "Submit a local event for review.",
        href: "/submit/event",
        icon: "calendar",
        tone: "brand",
      },
      {
        id: "add-place",
        label: "Add a place",
        description: "Tell Radius which local place is missing.",
        href: "/submit/place",
        icon: "map-pin",
        tone: "positive",
      },
    ],
  },
];

export const RADIUS_TOOLS: readonly RadiusTool[] = RADIUS_TOOL_GROUPS.flatMap(
  (group) => group.tools,
);

export const FEATURED_RADIUS_TOOLS: readonly RadiusTool[] = RADIUS_TOOLS.filter(
  (tool) => tool.featured,
);
