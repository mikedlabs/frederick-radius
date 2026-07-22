/**
 * Product-positioning content used only by the private-beta pitch at /pitch.
 *
 * This is intentionally not presented as telemetry, government data, customer
 * traction, or a financial forecast. Product stages below describe what the
 * pitch is showing: a working beta, features being tested, and concepts that
 * have not launched.
 */

export const COMMUNITIES = [
    { id: "frederick", name: "Frederick", preview: "Places + events" },
    { id: "urbana", name: "Urbana", preview: "Places + events" },
    { id: "brunswick", name: "Brunswick", preview: "Places + events" },
    { id: "walkersville", name: "Walkersville", preview: "Places + events" },
    { id: "new-market", name: "New Market", preview: "Places + events" },
    { id: "middletown", name: "Middletown", preview: "Places + events" },
    { id: "emmitsburg", name: "Emmitsburg", preview: "Places + events" },
    { id: "thurmont", name: "Thurmont", preview: "Places + events" },
    { id: "burkittsville", name: "Burkittsville", preview: "Places + events" },
    { id: "myersville", name: "Myersville", preview: "Places + events" },
    { id: "rosemont", name: "Rosemont", preview: "Places + events" },
    { id: "woodsboro", name: "Woodsboro", preview: "Places + events" },
] as const;

export const PERSONAS = [
    {
        id: "resident",
        name: "Resident",
        icon: "Home",
        benefit: "Start with what is useful today: nearby places, current events, and practical local updates.",
        primaryUse: "Plan a local day",
        useCase: "Everyday discovery",
        topFeatures: ["Today", "Radius", "Live conditions"],
    },
    {
        id: "visitor",
        name: "Visitor",
        icon: "MapPin",
        benefit: "Get oriented without opening a dozen tabs, then verify important details with the original source.",
        primaryUse: "Get oriented in Frederick",
        useCase: "Trip discovery",
        topFeatures: ["Town browsing", "Event ideas", "Source links"],
    },
    {
        id: "business",
        name: "Business Owner",
        icon: "Store",
        benefit: "See how a business appears in Radius and send corrections when a listing needs attention.",
        primaryUse: "Improve a listing",
        useCase: "Profile accuracy",
        topFeatures: ["Listing review", "Corrections", "Event visibility"],
    },
    {
        id: "contributor",
        name: "Community Contributor",
        icon: "Building2",
        benefit: "Flag missing or outdated information and help make local discovery more useful for everyone.",
        primaryUse: "Share local context",
        useCase: "Community input",
        topFeatures: ["Reports", "Feedback", "Source awareness"],
    },
] as const;

export const PILLARS = [
    {
        id: "local_discovery",
        title: "Local Discovery",
        description: "Browse places in and around Frederick with town, radius, and category controls.",
        icon: "Store",
        stats: "Working beta",
        color: "from-violet-500 to-purple-600",
    },
    {
        id: "events",
        title: "Events & Today",
        description: "Turn a scattered set of local calendars into a clearer starting point for what is happening.",
        icon: "Calendar",
        stats: "Working beta",
        color: "from-blue-500 to-cyan-600",
    },
    {
        id: "rewards",
        title: "Rewards Concept",
        description: "An exploratory idea for encouraging local participation; no rewards program or partner network has launched.",
        icon: "Coins",
        stats: "Concept only",
        color: "from-amber-500 to-orange-600",
    },
    {
        id: "civic_guide",
        title: "Civic Guide",
        description: "Help people find public information and continue to the appropriate official source. Radius does not issue permits.",
        icon: "Building2",
        stats: "Information + links",
        color: "from-emerald-500 to-teal-600",
    },
] as const;

export const PRODUCT_STATUS = {
    cards: [
        {
            label: "Local discovery",
            value: "Working beta",
            detail: "Search and browse the local place experience.",
            stage: "available",
        },
        {
            label: "Events & Today",
            value: "Working beta",
            detail: "Test a simpler way to find something to do.",
            stage: "available",
        },
        {
            label: "Community input",
            value: "Being tested",
            detail: "Corrections, feedback, and reports shape the product.",
            stage: "testing",
        },
        {
            label: "Rewards",
            value: "Concept only",
            detail: "The rewards concept has no partners or operating redemption network, and no coins have been issued.",
            stage: "concept",
        },
    ],
    roadmap: [
        { period: "Built", outcome: "Core discovery" },
        { period: "Now", outcome: "Early-access beta" },
        { period: "Next", outcome: "Validate with locals" },
        { period: "Later", outcome: "Expand what earns trust" },
    ],
    principles: ["Source clarity", "Useful defaults", "Local feedback", "Measured growth"],
} as const;

export const RADIUS_COIN = {
    status: "Concept only · Not launched",
    concept: "A possible non-cash rewards layer for local participation, shown here for discussion and testing.",
    earnOpportunities: [
        { action: "Visit a participating local business", label: "Example" },
        { action: "Attend a community event", label: "Example" },
        { action: "Share useful local feedback", label: "Example" },
        { action: "Complete a community challenge", label: "Example" },
    ],
    partnerStatus: "No participating partners have been announced.",
    circulationStatus: "No Radius Coins have been issued.",
    requirements: ["Opt-in businesses", "Clear reward terms", "Abuse controls"],
} as const;

export const SNAPSHOT = {
    eyebrow: "Private-beta product overview",
    stage: "Early-access beta",
    focus: "Frederick County",
    model: "Independent",
    posture: "Source-aware",
    tagline: "Find what fits your Frederick day.",
} as const;

const PITCH_CONTENT = {
    COMMUNITIES,
    PERSONAS,
    PILLARS,
    PRODUCT_STATUS,
    RADIUS_COIN,
    SNAPSHOT,
};

export default PITCH_CONTENT;
