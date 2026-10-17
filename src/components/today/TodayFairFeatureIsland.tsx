"use client";

import dynamic from "next/dynamic";

// Keep this boundary on the client: Next does not automatically split a
// Client Component dynamically imported directly from a Server Component.
// Today renders this island only during the existing promotion window.
// Default SSR preserves the active campaign's real image and useful link.
const TodayFairFeatureIsland = dynamic(() => import("./TodayFairFeature"));

export default TodayFairFeatureIsland;
