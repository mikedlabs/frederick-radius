"use client";

import dynamic from "next/dynamic";
import { GlassCard } from "@/components/ui/glass-card";
import { LensMode } from "@/data/frederick-data";

const MapComponent = dynamic(() => import("./map-component"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-[#030014]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm animate-pulse">Loading Radius Map...</p>
            </div>
        </div>
    ),
});

import { SimulationState } from "@/components/marketing/CitySimulator";

interface InteractiveMapProps {
    lensMode?: LensMode;
    simulationState?: SimulationState;
}

export default function InteractiveMap({ lensMode = "visitor", simulationState }: InteractiveMapProps) {
    return (
        <div className="w-full h-[800px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative group">
            <MapComponent lensMode={lensMode} simulationState={simulationState} />

            {/* Floating Header */}
            <div className="absolute top-6 left-6 z-[1000]">
                <GlassCard className="px-6 py-3 !bg-black/60 !backdrop-blur-md">
                    <h2 className="text-xl font-bold text-white font-outfit">Frederick Radius Map</h2>
                    <p className="text-xs text-gray-300">Live Data • {lensMode.charAt(0).toUpperCase() + lensMode.slice(1)} View</p>
                </GlassCard>
            </div>
        </div>
    );
}
