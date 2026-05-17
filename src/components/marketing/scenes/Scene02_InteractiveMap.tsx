"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { DEMOGRAPHICS } from "@/data/city-data-engine";
import { MapPin, Users, TrendingUp } from "lucide-react";

/**
 * SCENE 2: THE INTERACTIVE RADIUS MAP
 * Stylized 3D map of Frederick County with 12 municipality zones
 * Hovering triggers Micro-HUD with unique stats
 */
export default function Scene02_InteractiveMap() {
    const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);

    const selected = DEMOGRAPHICS.municipalities.find(m => m.id === selectedMunicipality);

    return (
        <div className="relative w-full h-full bg-gradient-to-b from-[#030014] to-[#0a0118] overflow-hidden">
            {/* Title Header */}
            <motion.div
                className="absolute top-12 left-1/2 -translate-x-1/2 z-30 text-center"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1 }}
            >
                <h2 className="text-5xl font-light text-white mb-2 tracking-tight">
                    The <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">12</span> Communities
                </h2>
                <p className="text-gray-400 text-lg font-light">
                    Hover to explore each municipality
                </p>
            </motion.div>

            {/* Map Container */}
            <div className="absolute inset-0 flex items-center justify-center">
                <svg
                    width="900"
                    height="700"
                    viewBox="0 0 900 700"
                    className="max-w-full"
                >
                    {/* County Outline */}
                    <motion.path
                        d="M 100 150 L 800 150 L 800 550 L 100 550 Z"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="2"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2, ease: "easeInOut" }}
                    />

                    {/* Municipality Zones */}
                    {DEMOGRAPHICS.municipalities.map((muni, index) => {
                        const x = 150 + (index % 4) * 180;
                        const y = 200 + Math.floor(index / 4) * 120;
                        const isSelected = selectedMunicipality === muni.id;

                        return (
                            <g key={muni.id}>
                                {/* Zone Circle */}
                                <motion.circle
                                    cx={x}
                                    cy={y}
                                    r={isSelected ? 55 : 45}
                                    fill={isSelected ? "rgba(251, 191, 36, 0.2)" : "rgba(139, 92, 246, 0.1)"}
                                    stroke={isSelected ? "#fbbf24" : "rgba(139, 92, 246, 0.3)"}
                                    strokeWidth={isSelected ? 3 : 2}
                                    className="cursor-pointer transition-all duration-300"
                                    onMouseEnter={() => setSelectedMunicipality(muni.id)}
                                    onMouseLeave={() => setSelectedMunicipality(null)}
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: index * 0.1, duration: 0.5 }}
                                />

                                {/* Pin Icon */}
                                <motion.g
                                    initial={{ scale: 0 }}
                                    animate={{ scale: isSelected ? 1.2 : 1 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <circle
                                        cx={x}
                                        cy={y - 10}
                                        r="3"
                                        fill="#fbbf24"
                                        opacity={isSelected ? 1 : 0.6}
                                    />
                                    {isSelected && (
                                        <motion.circle
                                            cx={x}
                                            cy={y - 10}
                                            r="3"
                                            fill="none"
                                            stroke="#fbbf24"
                                            strokeWidth="1"
                                            initial={{ scale: 1, opacity: 1 }}
                                            animate={{ scale: 3, opacity: 0 }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        />
                                    )}
                                </motion.g>

                                {/* Label */}
                                <text
                                    x={x}
                                    y={y + 25}
                                    fill={isSelected ? "#fff" : "#9ca3af"}
                                    fontSize="12"
                                    fontWeight={isSelected ? "600" : "400"}
                                    textAnchor="middle"
                                    className="pointer-events-none font-sans tracking-wide"
                                >
                                    {muni.name}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Micro-HUD (Data Panel) */}
            {selected && (
                <motion.div
                    className="absolute bottom-24 left-1/2 -translate-x-1/2 backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl min-w-[400px]"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
                            <MapPin className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-2xl font-semibold text-white mb-1">
                                {selected.name}
                            </h3>
                            <p className="text-sm text-gray-400 uppercase tracking-wider">
                                {selected.type}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <MicroStat
                            icon={<Users className="w-4 h-4" />}
                            label="Population"
                            value={selected.population.toLocaleString()}
                        />
                        <MicroStat
                            icon={<TrendingUp className="w-4 h-4" />}
                            label="Coordinates"
                            value={`${selected.lat.toFixed(2)}, ${selected.lng.toFixed(2)}`}
                        />
                    </div>

                    {/* Ambient Glow */}
                    <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 blur-2xl -z-10" />
                </motion.div>
            )}

            {/* Ambient Radial Gradient */}
            <div className="absolute inset-0 bg-radial-gradient from-violet-900/20 via-transparent to-transparent pointer-events-none" />
        </div>
    );
}

function MicroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="text-amber-400">{icon}</div>
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-semibold text-white">{value}</div>
            </div>
        </div>
    );
}
