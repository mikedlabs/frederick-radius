/**
 * FREDERICK RADIUS // CITY DATA ENGINE
 * Master data synthesis from all project sources
 * Current Snapshot: November 2025
 */

// ===== [1] CORE DEMOGRAPHICS =====
export const DEMOGRAPHICS = {
    population: {
        total: 305000,
        density: 183.7, // per sq mile
        growth: "+8.2%", // YoY trend
    },
    municipalities: [
        { id: "frederick", name: "Frederick City", population: 78691, lat: 39.4143, lng: -77.4105, type: "Urban Core" },
        { id: "urbana", name: "Urbana", population: 15720, lat: 39.3255, lng: -77.3511, type: "Growth District" },
        { id: "brunswick", name: "Brunswick", population: 8211, lat: 39.3137, lng: -77.6292, type: "Historic Rail Town" },
        { id: "walkersville", name: "Walkersville", population: 6678, lat: 39.4887, lng: -77.3550, type: "Residential Hub" },
        { id: "new_market", name: "New Market", population: 1134, lat: 39.3884, lng: -77.2714, type: "Antique Capital" },
        { id: "middletown", name: "Middletown", population: 4654, lat: 39.4443, lng: -77.5447, type: "Mountain Gateway" },
        { id: "emmitsburg", name: "Emmitsburg", population: 3118, lat: 39.7043, lng: -77.3261, type: "College Town" },
        { id: "thurmont", name: "Thurmont", population: 6722, lat: 39.6226, lng: -77.4108, type: "Catoctin Gateway" },
        { id: "burkittsville", name: "Burkittsville", population: 171, lat: 39.3931, lng: -77.6269, type: "Historic Village" },
        { id: "myersville", name: "Myersville", population: 1681, lat: 39.5040, lng: -77.5644, type: "Rural Charm" },
        { id: "rosemont", name: "Rosemont", population: 268, lat: 39.3976, lng: -77.3508, type: "Enclave" },
        { id: "woodsboro", name: "Woodsboro", population: 1264, lat: 39.5318, lng: -77.3147, type: "Agricultural Center" },
    ],
    totalArea: 1660, // square miles
};

// ===== [2] ECONOMIC INDICATORS =====
export const ECONOMY = {
    annualImpact: "$560M",
    activeBusinesses: 4500,
    businessGrowth: "+12% YoY",
    avgRevenue: "$124,444", // per business
    retailDensity: "2.7 businesses per 1,000 residents",
    downtownFootTraffic: "1.9M annual visitors",
    investmentSignals: [
        { category: "Residential Pipeline", value: "2,400 units", status: "Approved" },
        { category: "Market St Development", value: "$50M", status: "Active" },
        { category: "Tech Park Expansion", value: "$85M", status: "Planning" },
    ],
    businessCategories: [
        { type: "Retail", count: 1350, percentage: 30 },
        { type: "Food & Beverage", count: 900, percentage: 20 },
        { type: "Professional Services", count: 675, percentage: 15 },
        { type: "Healthcare", count: 450, percentage: 10 },
        { type: "Tech & Innovation", count: 225, percentage: 5 },
        { type: "Other", count: 900, percentage: 20 },
    ],
};

// ===== [3] LIFESTYLE & TOURISM =====
export const LIFESTYLE = {
    annualVisitors: "1.9M",
    events: {
        galleries: 20,
        murals: 15,
        festivals: 45, // annual
        farmerMarkets: 8,
    },
    outdoor: {
        parks: 78,
        hikingTrails: "200+ miles",
        bikeRoutes: 12,
        totalParkland: "5,400 acres",
    },
    culture: {
        museums: 7,
        theaters: 3,
        historicDistricts: 4,
        wineries: 11,
        breweries: 8,
    },
};

// ===== [4] CIVIC INFRASTRUCTURE =====
export const CIVIC = {
    services: [
        { name: "Voting Centers", count: 24, category: "Democracy" },
        { name: "Public Safety Stations", count: 18, category: "Safety" },
        { name: "Recycling Centers", count: 6, category: "Environment" },
        { name: "Recreation Centers", count: 32, category: "Wellness" },
    ],
    permits: {
        monthlyAvg: 342, // building permits
        trend: "+18% vs. 2024",
    },
    development: {
        active: "42 major projects",
        totalValue: "$680M",
    },
};

// ===== [5] FREDERICK RADIUS COIN (Rewards System) =====
export const RADIUS_COIN = {
    concept: "Gamified rewards for local engagement",
    earnOpportunities: [
        { action: "Check-in at local business", coins: 10 },
        { action: "Attend community event", coins: 25 },
        { action: "Review a local business", coins: 15 },
        { action: "Share event with friends", coins: 5 },
        { action: "Complete monthly challenge", coins: 100 },
    ],
    redeemPartners: 150, // local businesses
    totalCirculating: "2.5M coins",
};

// ===== [6] PERSONA JOURNEYS =====
export const PERSONAS = [
    {
        id: "resident",
        name: "Resident",
        icon: "Home",
        benefit: "Stay informed with real-time civic alerts, road closures, and community events within your custom radius.",
        primaryUse: "Civic Alerts & Local Discovery",
        engagement: "Daily",
        topFeatures: ["Notifications", "Event Calendar", "Service Finder"],
    },
    {
        id: "visitor",
        name: "Visitor",
        icon: "MapPin",
        benefit: "Discover curated experiences across 12 unique communities—from art walks to mountain trails—all in one tap.",
        primaryUse: "Tourism & Experience Planning",
        engagement: "Trip-Based",
        topFeatures: ["Interactive Map", "Itinerary Builder", "Hidden Gems"],
    },
    {
        id: "business",
        name: "Business Owner",
        icon: "Store",
        benefit: "Gain enterprise-grade analytics, promote events instantly, and access 305,000+ potential customers with zero friction.",
        primaryUse: "Marketing & Analytics",
        engagement: "Weekly",
        topFeatures: ["Dashboard", "Push Offers", "Customer Insights"],
    },
    {
        id: "planner",
        name: "City Planner",
        icon: "Building2",
        benefit: "Leverage aggregated civic data, zoning maps, and development pipelines to make data-driven decisions for Frederick's future.",
        primaryUse: "Data Intelligence & Planning",
        engagement: "Monthly",
        topFeatures: ["Analytics Hub", "GIS Integration", "Public Engagement"],
    },
];

// ===== [7] PLATFORM FEATURES (The Four Pillars) =====
export const PILLARS = [
    {
        id: "business_directory",
        title: "Business Directory",
        description: "Live map with 4,500+ verified businesses, hours, offers, and real-time updates.",
        icon: "Store",
        stats: "4,500+ Active Listings",
        color: "from-violet-500 to-purple-600",
    },
    {
        id: "events",
        title: "Events Feed",
        description: "Real-time event discovery across 12 municipalities with smart filtering and RSVP.",
        icon: "Calendar",
        stats: "45+ Events Monthly",
        color: "from-blue-500 to-cyan-600",
    },
    {
        id: "rewards",
        title: "Radius Coin",
        description: "Gamified rewards system encouraging local engagement with redeemable benefits.",
        icon: "Coins",
        stats: "150+ Partners",
        color: "from-amber-500 to-orange-600",
    },
    {
        id: "civic_hub",
        title: "Civic Services",
        description: "Integrated access to parking, permits, alerts, and all city services in one interface.",
        icon: "Building2",
        stats: "24/7 Access",
        color: "from-emerald-500 to-teal-600",
    },
];

// ===== [8] KEY METRICS (The Data Story) =====
export const METRICS = {
    realtime: [
        { metric: "Active Users", value: "47,234", change: "+2,341 this week", trend: "up" },
        { metric: "Events This Month", value: "128", change: "+23% vs. last month", trend: "up" },
        { metric: "Business Engagements", value: "15.7K", change: "Weekly average", trend: "stable" },
        { metric: "Radius Coins Earned", value: "89.2K", change: "This week", trend: "up" },
    ],
    growth: [
        { period: "Q1 2025", revenue: "$125K", users: 12000 },
        { period: "Q2 2025", revenue: "$287K", users: 28000 },
        { period: "Q3 2025", revenue: "$456K", users: 47000 },
        { period: "Q4 2025 (Projected)", revenue: "$680K", users: 72000 },
    ],
};

// ===== [9] GEOSPATIAL DATA (Map Layers) =====
export const GEO_LAYERS = {
    parks: [
        { name: "Carroll Creek Park", lat: 39.4120, lng: -77.4080, acres: 50, type: "Urban" },
        { name: "Catoctin Mountain Park", lat: 39.6237, lng: -77.4080, acres: 1660, type: "Wilderness" },
        { name: "Monocacy National Battlefield", lat: 39.3773, lng: -77.3956, acres: 1660, type: "Historic" },
        { name: "Urbana District Park", lat: 39.3282, lng: -77.3575, acres: 120, type: "Recreation" },
    ],
    development: [
        { name: "Market Street Corridor", lat: 39.4180, lng: -77.4100, value: "$50M", status: "Active" },
        { name: "Ballenger Creek Tech Park", lat: 39.3800, lng: -77.4000, value: "$85M", status: "Planning" },
        { name: "257 E 6th St (Historic)", lat: 39.4160, lng: -77.4090, value: "$4.2M", status: "For Sale" },
    ],
    events: [
        { name: "Downtown Art Walk", lat: 39.4160, lng: -77.4090, frequency: "Monthly", attendance: 2500 },
        { name: "Brunswick Railroad Days", lat: 39.3137, lng: -77.6292, frequency: "Annual", attendance: 15000 },
        { name: "Catoctin Colorfest", lat: 39.6226, lng: -77.4108, frequency: "Annual", attendance: 75000 },
    ],
};

// ===== [10] CRAFT BEVERAGE TRAIL =====
export const CRAFT_BEVERAGES = {
    totalEstablishments: 39,
    categories: [
        { type: "Breweries", count: 14 },
        { type: "Wineries", count: 11 },
        { type: "Distilleries", count: 4 },
        { type: "Cideries", count: 2 },
        { type: "Meaderies", count: 2 },
    ],
    highlights: [
        { id: "flying-dog", name: "Flying Dog Brewery", type: "brewery", lat: 39.4081, lng: -77.4209, address: "4607 Wedgewood Blvd, Frederick", website: "flyingdog.com", note: "Maryland's largest craft brewery" },
        { id: "attaboy", name: "Attaboy Beer", type: "brewery", lat: 39.4125, lng: -77.4088, address: "329 N Market St, Frederick", website: "attaboybeer.com" },
        { id: "smoketown", name: "Smoketown Brewing Station", type: "brewery", lat: 39.3125, lng: -77.6278, address: "223 W Potomac St, Brunswick", website: "smoketownbrewing.com" },
        { id: "idiom", name: "Idiom Brewing", type: "brewery", lat: 39.4160, lng: -77.4110, address: "24 N Market St, Frederick", website: "idiombrewing.com" },
        { id: "olde-mother", name: "Olde Mother Brewing", type: "brewery", lat: 39.4148, lng: -77.4095, address: "526 N Market St, Frederick", website: "oldemotherbrewing.com" },
        { id: "red-shedman", name: "Red Shedman Farm Brewery", type: "brewery", lat: 39.4570, lng: -77.5420, address: "12840 Spickler Rd, Clear Spring", website: "redshedman.com" },
        { id: "steinhardt", name: "Steinhardt Brewing", type: "brewery", lat: 39.4160, lng: -77.4100, address: "100 N East St, Frederick", website: "steinhardtbrewing.com" },
        { id: "milkhouse", name: "Milkhouse Brewery at Stillpoint Farm", type: "brewery", lat: 39.3750, lng: -77.2850, address: "8253 Dollyhyde Rd, Mt Airy", website: "milkhousebrewery.com" },
        { id: "rocket-frog", name: "Rocket Frog Brewing", type: "brewery", lat: 39.4135, lng: -77.4098, address: "540 N Market St, Frederick", website: "rocketfrogbrewing.com" },
        { id: "monocacy", name: "Monocacy Brewing", type: "brewery", lat: 39.4100, lng: -77.4050, address: "1781 N Market St, Frederick", website: "monocacybrewing.com" },
        { id: "midnight-run", name: "Midnight Run Brewing", type: "brewery", lat: 39.3810, lng: -77.3760, address: "4940 Waterfront Dr, Frederick" },
        { id: "barley-hops", name: "Barley & Hops Brewery", type: "brewery", lat: 39.4155, lng: -77.4092, address: "5473 Urban Pike, Frederick", website: "barleyandhopsbrewery.com" },
        { id: "jailbreak", name: "Jailbreak Brewing (Tap Room)", type: "brewery", lat: 39.4130, lng: -77.4085, address: "N Market St, Frederick" },
        { id: "waredaca", name: "Waredaca Brewing", type: "brewery", lat: 39.2950, lng: -77.2350, address: "Laytonsville area", website: "waredacabrewing.com" },
        { id: "linganore", name: "Linganore Winecellars", type: "winery", lat: 39.3780, lng: -77.3050, address: "13601 Glissans Mill Rd, Mt Airy", website: "linganorewines.com", note: "One of Maryland's oldest and largest wineries" },
        { id: "elk-run", name: "Elk Run Vineyards", type: "winery", lat: 39.3890, lng: -77.2800, address: "15113 Liberty Rd, Mt Airy", website: "elkrun.com" },
        { id: "loew", name: "Loew Vineyards", type: "winery", lat: 39.3700, lng: -77.2600, address: "14001 Liberty Rd, Mt Airy", website: "loewvineyards.com" },
        { id: "black-ankle", name: "Black Ankle Vineyards", type: "winery", lat: 39.3600, lng: -77.2500, address: "14463 Black Ankle Rd, Mt Airy", website: "blackankle.com" },
        { id: "springfield-manor", name: "Springfield Manor Winery & Distillery", type: "winery", lat: 39.5900, lng: -77.4200, address: "11836 Auburn Rd, Thurmont", website: "springfieldmanor.com" },
        { id: "hidden-hills", name: "Hidden Hills Farm & Vineyard", type: "winery", lat: 39.4800, lng: -77.5100, address: "Middletown area" },
        { id: "catoctin-breeze", name: "Catoctin Breeze Vineyard", type: "winery", lat: 39.5200, lng: -77.4500, address: "164 Stambaugh Rd, Thurmont", website: "catoctinbreeze.com" },
        { id: "links-bridge", name: "Links Bridge Vineyards", type: "winery", lat: 39.3500, lng: -77.2900, address: "Union Bridge area", website: "linksbridgevineyards.com" },
        { id: "serpent-ridge", name: "Serpent Ridge Vineyard", type: "winery", lat: 39.5100, lng: -77.3200, address: "Westminster area", website: "serpentridge.com" },
        { id: "regulars-reserve", name: "Regular's Reserve", type: "winery", lat: 39.4600, lng: -77.4300, address: "Frederick area" },
        { id: "willow-oaks", name: "Willow Oaks Craft Cider & Wine", type: "winery", lat: 39.4400, lng: -77.4600, address: "Middletown area" },
        { id: "mcclintock", name: "McClintock Distilling", type: "distillery", lat: 39.4125, lng: -77.4090, address: "35 S Carroll St, Frederick", website: "mcclintockdistilling.com", note: "Craft spirits using local grain" },
        { id: "tenth-ward", name: "Tenth Ward Distilling", type: "distillery", lat: 39.4140, lng: -77.4105, address: "508 E Church St, Frederick", website: "tenthwarddistilling.com" },
        { id: "dragon", name: "Dragon Distillery", type: "distillery", lat: 39.4100, lng: -77.4100, address: "101 W Patrick St, Frederick", website: "dragondistillery.com" },
        { id: "black-locust", name: "Black Locust Hops & Spirits", type: "distillery", lat: 39.4200, lng: -77.4150, address: "Frederick area" },
        { id: "distillery-lane", name: "Distillery Lane Ciderworks", type: "cidery", lat: 39.3950, lng: -77.5800, address: "5533 Gap Creek Rd, Jefferson", website: "distillerylaneciderworks.com" },
        { id: "urban-farmhouse", name: "Urban Farmhouse Cidery", type: "cidery", lat: 39.4130, lng: -77.4080, address: "Downtown Frederick" },
        { id: "orchid-cellar", name: "Orchid Cellar Meadery", type: "meadery", lat: 39.4440, lng: -77.5440, address: "8546 Pete Wiles Rd, Middletown", website: "orchidcellar.com", note: "Award-winning meadery in the Middletown Valley" },
        { id: "royal-meadery", name: "Royal Meadery", type: "meadery", lat: 39.4150, lng: -77.4100, address: "Downtown Frederick" },
    ],
};

// ===== [11] TRAILS & OUTDOOR =====
export const TRAILS = {
    totalTrails: 10,
    totalMiles: 179.8,
    trails: [
        { id: "catoctin-trail", name: "Catoctin Trail", distance: 28, difficulty: "difficult", trailhead: { lat: 39.6237, lng: -77.4080 }, description: "28-mile trail through Catoctin Mountain Park and Cunningham Falls State Park" },
        { id: "co-canal", name: "C&O Canal Towpath", distance: 15, difficulty: "easy", trailhead: { lat: 39.3137, lng: -77.6292 }, description: "Historic towpath along the Potomac River through Brunswick" },
        { id: "monocacy-battlefield", name: "Monocacy Battlefield Trails", distance: 5, difficulty: "easy", trailhead: { lat: 39.3773, lng: -77.3956 }, description: "Civil War battlefield with interpretive trails" },
        { id: "carroll-creek", name: "Carroll Creek Linear Park", distance: 1.3, difficulty: "easy", trailhead: { lat: 39.4120, lng: -77.4080 }, description: "Urban waterfront trail through downtown Frederick" },
        { id: "frederick-watershed", name: "Frederick Watershed", distance: 90, difficulty: "moderate", trailhead: { lat: 39.4500, lng: -77.4800 }, description: "7,800-acre municipal forest with 90 miles of trails" },
        { id: "gambrill-state-park", name: "Gambrill State Park", distance: 16, difficulty: "moderate", trailhead: { lat: 39.4780, lng: -77.4920 }, description: "Mountain trails with scenic overlooks of Frederick Valley" },
        { id: "cunningham-falls", name: "Cunningham Falls State Park", distance: 12, difficulty: "moderate", trailhead: { lat: 39.6300, lng: -77.4600 }, description: "Home to Maryland's largest cascading waterfall" },
        { id: "baker-park", name: "Baker Park Loop", distance: 1.5, difficulty: "easy", trailhead: { lat: 39.4180, lng: -77.4180 }, description: "Scenic loop through Frederick's premier urban park" },
        { id: "ballenger-creek", name: "Ballenger Creek Trail", distance: 4, difficulty: "easy", trailhead: { lat: 39.3700, lng: -77.4100 }, description: "Paved trail connecting neighborhoods in south Frederick" },
        { id: "sugarloaf-mountain", name: "Sugarloaf Mountain", distance: 7, difficulty: "moderate", trailhead: { lat: 39.2520, lng: -77.3950 }, description: "Iconic monadnock with panoramic views of the Piedmont" },
    ],
};

// ===== [12] TRANSIT =====
export const TRANSIT = {
    system: "Frederick County TransIT",
    totalRoutes: 9,
    marcStations: 3,
    routes: [
        { id: "route-10", name: "Route 10 - Green", corridor: "Frederick City Core", frequency: "30 min", hours: "6:00 AM - 8:00 PM" },
        { id: "route-20", name: "Route 20 - Blue", corridor: "Golden Mile / FSK Mall", frequency: "30 min", hours: "6:00 AM - 8:00 PM" },
        { id: "route-30", name: "Route 30 - Red", corridor: "Ballenger Creek / Urbana", frequency: "45 min", hours: "6:30 AM - 7:30 PM" },
        { id: "route-40", name: "Route 40 - Orange", corridor: "Walkersville / Woodsboro", frequency: "60 min", hours: "7:00 AM - 6:00 PM" },
        { id: "route-50", name: "Route 50 - Purple", corridor: "Thurmont / Emmitsburg", frequency: "60 min", hours: "7:00 AM - 6:00 PM" },
        { id: "route-60", name: "Route 60 - Brown", corridor: "Brunswick / Jefferson", frequency: "60 min", hours: "7:00 AM - 6:00 PM" },
        { id: "route-70", name: "Route 70 - Yellow", corridor: "Middletown / Myersville", frequency: "60 min", hours: "7:00 AM - 6:00 PM" },
        { id: "route-80", name: "Route 80 - Silver", corridor: "New Market / Mt Airy", frequency: "60 min", hours: "7:00 AM - 6:00 PM" },
        { id: "route-99", name: "Route 99 - Gold Connector", corridor: "Cross-county Express", frequency: "45 min", hours: "6:00 AM - 7:00 PM" },
    ],
    marc: [
        { id: "marc-frederick", name: "Frederick MARC Station", line: "Brunswick Line", lat: 39.4143, lng: -77.4105, address: "100 S East St, Frederick", peakTrains: 4 },
        { id: "marc-monocacy", name: "Monocacy MARC Station", line: "Brunswick Line", lat: 39.3890, lng: -77.3980, address: "Monocacy Blvd, Frederick", peakTrains: 4 },
        { id: "marc-brunswick", name: "Brunswick MARC Station", line: "Brunswick Line", lat: 39.3137, lng: -77.6292, address: "100 S Maryland Ave, Brunswick", peakTrains: 6 },
    ],
    stats: {
        dailyRidership: 4200,
        annualRidership: "1.1M",
        fleetSize: 42,
        accessibleVehicles: "100%",
    },
};

// ===== [13] SNAPSHOT SUMMARY =====
export const SNAPSHOT = {
    date: "November 2025",
    population: "305,000+",
    municipalities: 12,
    activeBusinesses: "4,500+",
    annualImpact: "$560M",
    parkland: "5,400 acres",
    annualVisitors: "1.9M",
    techReadiness: "98% broadband coverage",
    craftBeverages: 39,
    trailMiles: 179.8,
    trails: 10,
    transitRoutes: 9,
    marcStations: 3,
    tagline: "One Radius. One Community.",
};

export default {
    DEMOGRAPHICS,
    ECONOMY,
    LIFESTYLE,
    CIVIC,
    RADIUS_COIN,
    PERSONAS,
    PILLARS,
    METRICS,
    GEO_LAYERS,
    CRAFT_BEVERAGES,
    TRAILS,
    TRANSIT,
    SNAPSHOT,
};
