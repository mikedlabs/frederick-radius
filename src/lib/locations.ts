export interface Location {
    id: string;
    name: string;
    category: "Business" | "Civic" | "Event" | "Park" | "Development";
    lat: number;
    lng: number;
    description: string;
    pdfUrl?: string;
    stats?: string;
}

export const locations: Location[] = [
    {
        id: "1",
        name: "Downtown Frederick Partnership",
        category: "Civic",
        lat: 39.4143,
        lng: -77.4105,
        description: "View annual reports and strategic plans from the Downtown Frederick Partnership.",
        pdfUrl: "https://downtownfrederick.org/wp-content/uploads/DFP-2022-Annual-Report-7-22.pdf",
        stats: "4,500+ Businesses",
    },
    {
        id: "2",
        name: "Monocacy National Battlefield",
        category: "Park",
        lat: 39.3773,
        lng: -77.3956,
        description: "Monocacy National Battlefield is a historic park with public safety maps and visitor guides.",
        pdfUrl: "https://maps.frederickcountymd.gov/pdf/publicsafety/Monocacy.pdf",
        stats: "1,660 acres",
    },
    {
        id: "3",
        name: "Brunswick Police Dept",
        category: "Civic",
        lat: 39.3137,
        lng: -77.6292,
        description: "The Brunswick Police Department publishes a map of its service area.",
        pdfUrl: "https://maps.frederickcountymd.gov/pdf/publicsafety/SAM/BPD.pdf",
        stats: "Service Area Map",
    },
    {
        id: "4",
        name: "Art Walk - Downtown",
        category: "Event",
        lat: 39.4160,
        lng: -77.4090,
        description: "Use the official Art Walk map to explore local galleries and studios.",
        pdfUrl: "https://downtownfrederick.org/wp-content/uploads/Downtown-Frederick-Artwalk.pdf",
        stats: "20+ Galleries",
    },
    {
        id: "5",
        name: "UnchARTed Alley Murals",
        category: "Event",
        lat: 39.4130,
        lng: -77.4120,
        description: "Use this map to find murals and street art throughout downtown alleys.",
        pdfUrl: "https://downtownfrederick.org/wp-content/uploads/unchARTed-Alley-Map.pdf",
        stats: "15 Murals",
    },
    {
        id: "6",
        name: "Market Street Development",
        category: "Development",
        lat: 39.4180,
        lng: -77.4100,
        description: "Review the streetscape study and development plans for Market Street.",
        pdfUrl: "https://downtownfrederick.org/wp-content/uploads/Downtown-Frederick-Streetscape-Study_2021.pdf",
        stats: "$50M Investment",
    },
    {
        id: "7",
        name: "Urbana District Park",
        category: "Park",
        lat: 39.3282,
        lng: -77.3575,
        description: "Urbana District Park is a community recreation site included on the county planning map.",
        pdfUrl: "https://maps.frederickcountymd.gov/GISPublicDownload/MapAtlas/CountywideMaps/ParksRecCenters_34x44.pdf",
        stats: "Sports Complex",
    },
    {
        id: "8",
        name: "Catoctin Mountain Park",
        category: "Park",
        lat: 39.6237,
        lng: -77.4080,
        description: "Catoctin Mountain Park is a mountain park near Thurmont, and county maps show the surrounding environmental protection areas.",
        pdfUrl: "https://maps.frederickcountymd.gov/GISPublicDownload/MapAtlas/CountywideMaps/WellheadProtection_34x44.pdf",
        stats: "Hiking Trails",
    },
];
