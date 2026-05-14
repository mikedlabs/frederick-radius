"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import { divIcon } from "leaflet";
import { GlassCard } from "@/components/ui/glass-card";
import { FileText } from "lucide-react";
import { AnimatedButton } from "@/components/ui/animated-button";
import { MAP_LAYERS, LensMode } from "@/data/frederick-data";
import { useEffect } from "react";

// Custom pulsing marker
const createCustomIcon = (type: string) => {
    let color = "bg-primary";
    if (type === "park" || type === "art") color = "bg-green-500";
    if (type === "civic" || type === "service") color = "bg-secondary";
    if (type === "property" || type === "zone") color = "bg-accent";

    return divIcon({
        className: "custom-marker",
        html: `<div class="relative w-6 h-6">
            <div class="absolute inset-0 ${color} rounded-full animate-ping opacity-75"></div>
            <div class="relative w-6 h-6 ${color} rounded-full border-2 border-white shadow-lg"></div>
           </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });
};

function MapController({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, 13, { duration: 2 });
    }, [center, map]);
    return null;
}

import { SimulationState } from "@/components/marketing/CitySimulator";

interface MapComponentProps {
    lensMode?: LensMode;
    simulationState?: SimulationState;
}

export default function MapComponent({ lensMode = "visitor", simulationState }: MapComponentProps) {
    const layer = MAP_LAYERS[lensMode];
    const centerPoint = layer.points[0];

    return (
        <div className="w-full h-full relative z-0">
            <MapContainer
                center={[39.4143, -77.4105]}
                zoom={12}
                scrollWheelZoom={false}
                className="w-full h-full bg-[#030014]"
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <MapController center={[centerPoint.lat, centerPoint.lng]} />

                {layer.points.map((point, idx) => (
                    <Marker
                        key={`${lensMode}-${idx}`}
                        position={[point.lat, point.lng]}
                        icon={createCustomIcon(point.type)}
                    >
                        <Popup className="bg-transparent border-none shadow-none p-0">
                            <GlassCard className="w-72 p-4 !bg-black/80 !backdrop-blur-xl border-white/20">
                                <div className="flex items-start justify-between mb-2">
                                    <span className="text-xs font-bold px-2 py-1 rounded-full border border-white/10 bg-primary/20 text-primary-300 uppercase">
                                        {point.type}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-white mb-1 font-outfit">{point.label}</h3>
                                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                    {lensMode === "investor" ? "Investment Opportunity available. See PDF for details." : "Experience the best of Frederick County."}
                                </p>

                                <AnimatedButton variant="secondary" className="w-full py-2 text-sm">
                                    <FileText className="w-3 h-3 mr-2" /> View Details
                                </AnimatedButton>
                            </GlassCard>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Overlay Controls */}
            <div className="absolute bottom-8 left-8 z-[1000] flex flex-col gap-2">
                <div className="glass-panel px-3 py-2 rounded-lg border border-white/10 bg-black/40 backdrop-blur-md">
                    <span className="text-xs text-gray-400 uppercase block mb-1">Active Layer</span>
                    <span className="text-sm font-bold text-white">{layer.name}</span>
                </div>
            </div>
        </div>
    );
}

