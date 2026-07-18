export interface FrederickDataPoint {
    label: string;
    value: string;
    trend?: string;
    category: "economy" | "community" | "growth";
}

export interface MapLayer {
    id: string;
    name: string;
    type: "visitor" | "resident" | "investor";
    points: { lat: number; lng: number; label: string; type: string }[];
}

export const MARKET_STATS: FrederickDataPoint[] = [
    { label: "Annual Economic Impact", value: "$560M", trend: "+12% YoY", category: "economy" },
    { label: "Active Businesses", value: "4,500+", trend: "Growing", category: "economy" },
    { label: "Annual Visitors", value: "1.9M", trend: "High Season", category: "community" },
    { label: "Municipalities", value: "12", category: "community" },
    { label: "Square Miles", value: "1,660", category: "growth" },
    { label: "Residential Pipeline", value: "2,400 Units", trend: "Approved", category: "growth" },
];

export const LENS_MODES = [
    { id: "visitor", label: "Visitor", icon: "Map", description: "Find tourism, arts, and events." },
    { id: "resident", label: "Resident", icon: "Home", description: "Find civic alerts and services." },
    { id: "investor", label: "Investor", icon: "TrendingUp", description: "Review zoning and development." },
] as const;

export type LensMode = typeof LENS_MODES[number]["id"];

// Mock data derived from the CSV/PDF analysis
export const MAP_LAYERS: Record<LensMode, MapLayer> = {
    visitor: {
        id: "visitor-layer",
        name: "Tourism & Arts",
        type: "visitor",
        points: [
            { lat: 39.4143, lng: -77.4105, label: "Downtown Art Walk", type: "art" },
            { lat: 39.4120, lng: -77.4080, label: "Carroll Creek Park", type: "park" },
            { lat: 39.6360, lng: -77.4580, label: "Catoctin Mountain Park", type: "park" },
            { lat: 39.3130, lng: -77.6430, label: "Brunswick Railroad Museum", type: "culture" },
        ]
    },
    resident: {
        id: "resident-layer",
        name: "Civic Services",
        type: "resident",
        points: [
            { lat: 39.4150, lng: -77.4110, label: "City Hall", type: "civic" },
            { lat: 39.4200, lng: -77.4000, label: "Fairgrounds (Voting)", type: "civic" },
            { lat: 39.4000, lng: -77.4200, label: "Recycling Center", type: "service" },
        ]
    },
    investor: {
        id: "investor-layer",
        name: "Development Opportunities",
        type: "investor",
        points: [
            { lat: 39.4160, lng: -77.4090, label: "257 E 6th St (For Sale)", type: "property" },
            { lat: 39.3800, lng: -77.4000, label: "Ballenger Creek Dev Zone", type: "zone" },
            { lat: 39.4500, lng: -77.3500, label: "Tech Park Expansion", type: "zone" },
        ]
    }
};

export const REPORTS_CATALOG = [
    { title: "DFP Annual Report 2022", category: "Annual Report", url: "https://downtownfrederick.org/wp-content/uploads/DFP-2022-Annual-Report-7-22.pdf" },
    { title: "Business Performance Survey 2021", category: "Business / Survey", url: "https://downtownfrederick.org/wp-content/uploads/2021-Downtown-Frederick-Business-Performance-Survey-Results-Report.pdf" },
    { title: "Streetscape Study RFP", category: "Planning", url: "https://downtownfrederick.org/wp-content/uploads/Downtown-Frederick-Streetscape-Study-RFP-February-2021.pdf" },
    { title: "Hotel Rental Tax Ordinance", category: "Ordinance", url: "https://www.frederickcountymd.gov/DocumentCenter/View/1764" },
];
