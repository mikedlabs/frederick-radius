/**
 * Public names for the product surfaces that appear in several registries.
 *
 * Routes and internal component names can stay stable while the words a user
 * sees remain literal and consistent. In-app labels are intentionally short;
 * page and share titles provide the Frederick County context on their own.
 */
export const PRODUCT_NAMES = {
  ask: {
    uiLabel: "Ask Radius",
    pageTitle: "Ask Radius",
    shareTitle: "Ask Radius by Frederick Radius",
    description: "Get a source-backed local answer or build an outing around your constraints.",
  },
  allTools: {
    uiLabel: "All tools",
    pageTitle: "All tools",
    shareTitle: "All Frederick Radius tools",
    description: "Search every Frederick Radius tool from one index.",
  },
  liveConditions: {
    uiLabel: "Live conditions",
    pageTitle: "Live conditions in Frederick County",
    shareTitle: "Live conditions in Frederick County | Frederick Radius",
    description: "Check current Frederick County conditions from official and attributed sources.",
  },
  beer: {
    uiLabel: "Beer",
    pageTitle: "Beer in Frederick County",
    shareTitle: "Beer in Frederick County | Frederick Radius",
    description: "Browse local breweries, signature beers, taproom events, and saved pours.",
  },
  outingPlanner: {
    uiLabel: "Outing planner",
    pageTitle: "Outing planner",
    shareTitle: "Plan an outing in Frederick County | Frederick Radius",
    description: "Build an editable outing from listed Frederick County places that fit your time and focus.",
  },
  localLists: {
    uiLabel: "Local lists",
    pageTitle: "Local lists",
    shareTitle: "Local lists for Frederick County | Frederick Radius",
    description: "Browse authored local shortlists for a specific kind of day or need.",
  },
  publicDispatch: {
    uiLabel: "Public dispatch calls",
    pageTitle: "Public dispatch calls",
    shareTitle: "Public dispatch calls in Frederick County | Frederick Radius",
    description: "Read recent non-medical public dispatch calls in plain language.",
  },
  countyNumbers: {
    uiLabel: "Frederick County in numbers",
    pageTitle: "Frederick County in numbers",
    shareTitle: "Frederick County in numbers | Frederick Radius",
    description: "See counts calculated from the published Frederick Radius datasets.",
  },
  saved: {
    uiLabel: "Saved",
    pageTitle: "Saved",
    shareTitle: "A shared Frederick list | Frederick Radius",
    description: "Keep places, events, and beer picks together.",
  },
} as const;
