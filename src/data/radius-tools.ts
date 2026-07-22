import { PRODUCT_NAMES } from "@/lib/product-names";

export type RadiusToolIcon =
  | "activity"
  | "archive"
  | "beer"
  | "bike"
  | "bookmark"
  | "bus"
  | "calendar"
  | "calendar-check"
  | "camera"
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
  /** Words and short phrases a resident might type to reach this tool. Every
   *  keyword is a claim the destination answers it, so keep them honest. */
  keywords?: string[];
  /** Informational or "about the app" surfaces (About, Trust) rather than a
   *  county tool. Surfaces can present these apart from the working toolbox. */
  meta?: boolean;
};

export type RadiusToolGroup = {
  id: string;
  label: string;
  tools: readonly RadiusTool[];
};

/**
 * Real user actions that Frederick Radius currently ships, organized on ONE
 * axis: the SUBJECT a resident is thinking about (food, getting around, the
 * outdoors, planning, civic life). Urgency is a cross-cutting `featured` flag,
 * not a category, so "open now" sits with the other food tools instead of in a
 * separate "right now" bucket that fought the subject grouping.
 *
 * This registry is the single source of truth for the Ask toolbox
 * (RadiusToolbox), the Compass directory (CompassHub), and the searchable app
 * guides (app-pages.ts is kept in sync against it). Content indexes, admin
 * pages, and unfinished integrations do not belong here. Every item must open a
 * working tool or a supported tool state.
 *
 * Feature-gated aerial surfaces (from-above/time-machine) are intentionally
 * NOT registered here: the toolbox and its runtime-health checks require every
 * tool route to render, and that route is fail-closed behind a license flag.
 * CompassHub surfaces it separately, behind the same gate.
 */
export const RADIUS_TOOL_GROUPS: readonly RadiusToolGroup[] = [
  {
    id: "eat-drink",
    label: "Eat & drink",
    tools: [
      {
        id: "open-now",
        label: "Open now",
        description: "Check posted hours and rank options from your chosen area.",
        href: "/open-now",
        icon: "activity",
        tone: "positive",
        featured: true,
        keywords: ["open now", "open late", "still open", "whats open"],
      },
      {
        id: "reserve",
        label: "Book a table",
        description: "Open checked restaurant reservation links.",
        href: "/reserve",
        icon: "utensils",
        tone: "brand",
        keywords: ["reserve", "reservation", "reservations", "book a table", "opentable", "resy"],
      },
      {
        id: "brunch",
        label: "Brunch guide",
        description: "Browse weekend brunch listings with posted days and hours.",
        href: "/brunch",
        icon: "coffee",
        tone: "accent",
        keywords: ["brunch", "mimosa", "bottomless"],
      },
      {
        id: "happy-hour",
        label: "Happy hour",
        description: "See checked happy-hour schedules and deal details.",
        href: "/happy-hour",
        icon: "beer",
        tone: "brand",
        keywords: ["happy hour", "drink specials", "drink deals"],
      },
      {
        id: "deals",
        label: "Daily deals",
        description: "Browse checked specials for the current day.",
        href: "/deals",
        icon: "tag",
        tone: "brand",
        keywords: ["deals", "specials", "taco tuesday", "wing night", "trivia night"],
      },
      {
        id: "food-trucks",
        label: "Food trucks",
        description: "Find local mobile food vendors and their published feeds.",
        href: "/food-trucks",
        icon: "truck",
        tone: "positive",
        keywords: ["food truck", "food trucks"],
      },
      {
        id: "beer-tools",
        label: "Beer tools",
        description: "Match a pour, browse taprooms, and use your beer passport.",
        href: "/beer#find-your-pour",
        icon: "beer",
        tone: "accent",
        keywords: ["beer", "brewery", "breweries", "taproom", "pour"],
      },
      {
        id: "live-music",
        label: "Live music",
        description: "See published venue lineups and ticketed shows.",
        href: "/live-music",
        icon: "music",
        tone: "cool",
        keywords: ["live music", "bands", "who is playing", "lineup"],
      },
    ],
  },
  {
    id: "get-around",
    label: "Get around",
    tools: [
      {
        id: "county-map",
        label: "County map",
        description: "Browse the full county map and its practical layers.",
        href: "/map?in=county",
        icon: "map",
        tone: "cool",
        featured: true,
        keywords: ["map", "county map", "layers"],
      },
      {
        id: "nearby",
        label: "Nearby",
        description: "Rank useful places from a real location or chosen town.",
        href: "/nearby",
        icon: "map-pin",
        tone: "cool",
        keywords: ["near me", "closest", "around me"],
      },
      {
        id: "parking",
        label: "Parking",
        description: "Find downtown garages and event parking guidance.",
        href: "/parking",
        icon: "parking",
        tone: "cool",
        keywords: ["parking", "garage", "parkmobile"],
      },
      {
        id: "transit",
        label: "Transit and trains",
        description: "Review TransIT routes and MARC information.",
        href: "/transit",
        icon: "bus",
        tone: "cool",
        keywords: ["bus", "transit", "marc", "commuter"],
      },
      {
        id: "shipping",
        label: "Post and shipping",
        description: "Find listed postal and shipping locations by town.",
        href: "/shipping",
        icon: "package",
        tone: "brand",
        keywords: ["post office", "usps", "ups", "fedex", "mail", "package", "drop box", "shipping"],
      },
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    tools: [
      {
        id: "parks",
        label: "Parks",
        description: "Browse parks returned by Frederick County GIS.",
        href: "/parks",
        icon: "trees",
        tone: "positive",
        keywords: ["parks", "playground", "open space", "dog park"],
      },
      {
        id: "trails",
        label: "Trails",
        description: "Browse trails with available length and surface details.",
        href: "/trails",
        icon: "route",
        tone: "positive",
        keywords: ["trail", "trails", "hike", "hiking", "biking"],
      },
      {
        id: "rivers",
        label: "River levels",
        description: "Read current USGS gauge data for local waterways.",
        href: "/rivers",
        icon: "waves",
        tone: "cool",
        keywords: ["river", "rivers", "water level", "gauge", "fishing", "kayak"],
      },
    ],
  },
  {
    id: "essentials",
    label: "Public essentials",
    tools: [
      {
        id: "public-essentials",
        label: "Public essentials",
        description: "Open the map for restrooms, water, trash, Wi-Fi, and more.",
        href: "/map?amenity=restroom,water,trash,dog,wifi,ev,outlet,bike,seating,play,safety",
        icon: "map-pin",
        tone: "civic",
        featured: true,
        keywords: ["public essentials", "restroom", "water", "wifi"],
      },
      {
        id: "amenities-guide",
        label: "Amenities guide",
        description: "Review every mapped public-amenity category.",
        href: "/amenities",
        icon: "compass",
        tone: "civic",
        keywords: ["restroom", "bathroom", "wifi", "ev charging", "bike rack", "picnic", "water fountain"],
      },
      {
        id: "restrooms",
        label: "Restrooms",
        description: "Open the map with known public restrooms visible.",
        href: "/map?amenity=restroom",
        icon: "toilet",
        tone: "civic",
        keywords: ["restroom", "restrooms", "bathroom", "toilet"],
      },
      {
        id: "water",
        label: "Water",
        description: "Open the map with known public water points visible.",
        href: "/map?amenity=water",
        icon: "waves",
        tone: "cool",
        keywords: ["water fountain", "drinking water", "water"],
      },
      {
        id: "trash-cans",
        label: "Trash cans",
        description: "Open the map with field-mapped trash cans visible.",
        href: "/map?amenity=trash",
        icon: "trash",
        tone: "civic",
        keywords: ["trash can", "garbage", "trash"],
      },
      {
        id: "dog-stations",
        label: "Dog stations",
        description: "Open the map with known dog-waste stations visible.",
        href: "/map?amenity=dog",
        icon: "dog",
        tone: "positive",
        keywords: ["dog waste", "dog station", "poop bag"],
      },
      {
        id: "public-wifi",
        label: "Public Wi-Fi",
        description: "Open the map with known public Wi-Fi visible.",
        href: "/map?amenity=wifi",
        icon: "wifi",
        tone: "cool",
        keywords: ["wifi", "wireless", "public wifi"],
      },
      {
        id: "ev-charging",
        label: "EV charging",
        description: "Open the map with known EV charging points visible.",
        href: "/map?amenity=ev",
        icon: "car",
        tone: "positive",
        keywords: ["ev charging", "charger", "charging station"],
      },
      {
        id: "power-outlets",
        label: "Power outlets",
        description: "Open the map with known public outlets visible.",
        href: "/map?amenity=outlet",
        icon: "plug",
        tone: "accent",
        keywords: ["power outlet", "plug", "charge phone"],
      },
      {
        id: "bike-racks",
        label: "Bike racks",
        description: "Open the map with known bike racks visible.",
        href: "/map?amenity=bike",
        icon: "bike",
        tone: "positive",
        keywords: ["bike rack", "bicycle parking"],
      },
      {
        id: "seating",
        label: "Public seating",
        description: "Open the map with field-mapped seating visible.",
        href: "/map?amenity=seating",
        icon: "map-pin",
        tone: "accent",
        keywords: ["bench", "seating", "sit"],
      },
      {
        id: "play-areas",
        label: "Play areas",
        description: "Open the map with known play areas visible.",
        href: "/map?amenity=play",
        icon: "sparkles",
        tone: "positive",
        keywords: ["playground", "play area"],
      },
      {
        id: "emergency",
        label: "Emergency & urgent care",
        description: "Call 911, the county ER, urgent care, poison and crisis lines.",
        href: "/emergency",
        icon: "activity",
        tone: "brand",
        keywords: ["emergency", "911", "hospital", "emergency room", "ER", "urgent care", "poison control", "frederick health", "ambulance", "crisis"],
      },
      {
        id: "scanner",
        label: "County scanner",
        description: "Live public dispatch calls in plain language: crashes, fires, wires down.",
        href: "/scanner",
        icon: "activity",
        tone: "brand",
        keywords: ["scanner", "police scanner", "fire scanner", "dispatch", "911 calls", "incidents", "crashes", "fires", "wires down", "frederick scanner"],
      },
      {
        id: "emergency-vet",
        label: "Emergency vet care",
        description: "Find listed emergency animal care and poison-help contacts.",
        href: "/emergency-vet",
        icon: "paw",
        tone: "brand",
        keywords: ["emergency vet", "animal hospital", "pet emergency", "pet poison"],
      },
    ],
  },
  {
    id: "events-plans",
    label: "Events & planning",
    tools: [
      {
        id: "events",
        label: "Events",
        description: "See what is happening today, tonight, or later.",
        href: "/events",
        icon: "calendar",
        tone: "brand",
        featured: true,
        keywords: ["events", "whats on", "things to do"],
      },
      {
        id: "event-calendar",
        label: "Event calendar",
        description: "Browse listed events on a month calendar.",
        href: "/events/calendar",
        icon: "calendar",
        tone: "brand",
        keywords: ["calendar", "month view", "events calendar"],
      },
      {
        id: "check-a-date",
        label: "Check a date",
        description: "Review listed events before you schedule something.",
        href: "/check-a-date",
        icon: "calendar-check",
        tone: "cool",
        keywords: ["check a date", "date conflict", "schedule conflict"],
      },
      {
        id: "sports",
        label: "Catch a game",
        description: "Follow pro, college, and high-school teams, then find places to play.",
        href: "/sports",
        icon: "activity",
        tone: "accent",
        keywords: ["sports", "frederick keys", "keys game", "flying cows", "cows game", "hood blazers", "mount st marys", "mountaineers", "fcc cougars", "high school sports", "fcps athletics", "basketball", "baseball", "golf", "pickleball", "swimming pool"],
      },
      {
        id: "plan",
        label: "Plan an outing",
        description: "Build an editable route around your time and mood.",
        href: "/plan",
        icon: "route",
        tone: "accent",
        featured: true,
        keywords: ["itinerary", "plan my day", "day plan"],
      },
      {
        id: "collections",
        label: PRODUCT_NAMES.localLists.uiLabel,
        description: PRODUCT_NAMES.localLists.description,
        href: "/collections",
        icon: "compass",
        tone: "accent",
        keywords: ["collections", "shortlist", "curated", "lists"],
      },
    ],
  },
  {
    id: "civic",
    label: "Civic & services",
    tools: [
      {
        id: "county-pulse",
        label: PRODUCT_NAMES.liveConditions.uiLabel,
        description: PRODUCT_NAMES.liveConditions.description,
        href: "/pulse",
        icon: "activity",
        tone: "brand",
        featured: true,
        keywords: ["traffic", "power outage", "outage", "school closings", "road conditions", "live conditions", "pulse"],
      },
      {
        id: "contacts",
        label: "City and county contacts",
        description: "Find the right public office and its phone number.",
        href: "/contacts",
        icon: "landmark",
        tone: "civic",
        keywords: ["contacts", "who do i call", "county services", "city services", "government", "311"],
      },
      {
        id: "nonprofits",
        label: "Nonprofits",
        description: "Browse county nonprofit records by cause.",
        href: "/nonprofits",
        icon: "landmark",
        tone: "civic",
        keywords: ["nonprofit", "nonprofits", "charity", "charities", "volunteer"],
      },
    ],
  },
  {
    id: "county-data",
    label: "The county, in data",
    tools: [
      {
        id: "numbers",
        label: "The county, counted",
        description: "See counts calculated from the current Radius datasets.",
        href: "/numbers",
        icon: "sigma",
        tone: "cool",
        keywords: ["numbers", "stats", "statistics", "how many", "almanac", "counted"],
      },
      {
        id: "rhythm",
        label: "The county rhythm",
        description: "See how posted business hours change through the week.",
        href: "/rhythm",
        icon: "activity",
        tone: "accent",
        keywords: ["rhythm", "county hours", "business hours"],
      },
      {
        id: "overhead",
        label: "Flights overhead",
        description: "See aircraft currently transmitting near Frederick.",
        href: "/overhead",
        icon: "plane",
        tone: "cool",
        keywords: ["planes", "plane", "flight", "flights", "helicopter"],
      },
    ],
  },
  {
    id: "explore",
    label: "Explore & history",
    tools: [
      {
        id: "search",
        label: "Search everything",
        description: "Search places, events, towns, guides, and tools.",
        href: "/search",
        icon: "search",
        tone: "brand",
        keywords: ["search", "find"],
      },
      {
        id: "places",
        label: "Places, A to Z",
        description: "Browse the full place index or switch to a map.",
        href: "/places",
        icon: "store",
        tone: "brand",
        keywords: ["directory", "all places", "a to z", "listings"],
      },
      {
        id: "towns",
        label: "Towns and communities",
        description: "Choose an area and open its local guide.",
        href: "/towns",
        icon: "map-pin",
        tone: "brand",
        keywords: ["towns", "municipalities", "villages"],
      },
      {
        id: "markers",
        label: "Markers and landmarks",
        description: "Read roadside markers and find registered historic sites.",
        href: "/markers",
        icon: "landmark",
        tone: "civic",
        keywords: ["historical markers", "covered bridge", "landmark", "monument"],
      },
      {
        id: "history",
        label: "County history",
        description: "The history guide shows dated local moments tied to real places.",
        href: "/history",
        icon: "history",
        tone: "accent",
        keywords: ["history", "historic"],
      },
      {
        id: "archive",
        label: "Archive Lens",
        description: "Archive Lens shows Frederick maps, surveys, newspapers, and photographs.",
        href: "/archive",
        icon: "archive",
        tone: "accent",
        keywords: ["old maps", "newspapers", "historic photos", "library of congress", "archive"],
      },
      {
        id: "dear-frederick",
        label: "Dear Frederick",
        description: "Read handwritten letters mailed to Frederick and gathered here.",
        href: "/dear-frederick",
        icon: "history",
        tone: "accent",
        keywords: ["letters", "dear frederick", "community letters"],
      },
      {
        id: "from-above-preview",
        label: "From Above",
        description: "See Frederick County through Mike's drone archive.",
        href: "/from-above/preview",
        icon: "camera",
        tone: "cool",
        keywords: ["aerial", "drone", "photography", "from above"],
      },
    ],
  },
  {
    id: "yours",
    label: "Yours",
    tools: [
      {
        id: "saved",
        label: "Saved",
        description: "Open the places, events, and routes saved on this device.",
        href: "/my-radius",
        icon: "bookmark",
        tone: "brand",
        keywords: ["saved", "favorites", "bookmarks"],
      },
      {
        id: "settings",
        label: "Settings",
        description: "Choose your home area and tune Radius for your needs.",
        href: "/settings",
        icon: "settings",
        tone: "cool",
        keywords: ["settings", "home town", "preferences"],
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Choose the local updates you want Radius to send.",
        href: "/settings/notifications",
        icon: "activity",
        tone: "brand",
        keywords: ["notifications", "alerts"],
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
        keywords: ["report", "mark a spot", "field note", "missing"],
      },
      {
        id: "add-event",
        label: "Add an event",
        description: "Submit a local event for review.",
        href: "/submit/event",
        icon: "calendar",
        tone: "brand",
        keywords: ["add event", "submit event"],
      },
      {
        id: "add-place",
        label: "Add a place",
        description: "Tell Radius which local place is missing.",
        href: "/submit/place",
        icon: "map-pin",
        tone: "positive",
        keywords: ["add place", "missing place", "suggest place"],
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

/**
 * The single-category public-amenity map filters (restrooms, water, Wi-Fi, EV
 * charging, dog stations, bike racks, seating, play areas, and the rest). These
 * are the sub-amenity chips surfaced prominently on the Compass directory and
 * the Today toolbox teaser, so amenities read as their own labelled set rather
 * than a dozen look-alike list rows. Derived from the essentials group: any
 * tool that opens the map to exactly one amenity layer.
 */
export const AMENITY_MAP_TOOLS: readonly RadiusTool[] = (
  RADIUS_TOOL_GROUPS.find((group) => group.id === "essentials")?.tools ?? []
).filter((tool) => tool.href.startsWith("/map?amenity=") && !tool.href.includes(","));
