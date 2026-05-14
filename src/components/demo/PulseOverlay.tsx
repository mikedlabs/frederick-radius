"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MARKET_STATS } from "@/data/frederick-data";
import { Activity } from "lucide-react";

import { SimulationState } from "@/components/demo/CitySimulator";

interface PulseOverlayProps {
    simulationState?: SimulationState;
}

export function PulseOverlay({ simulationState }: PulseOverlayProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        // Speed up data feed based on infrastructure investment
        const speed = simulationState ? 4000 - (simulationState.infrastructure * 30) : 4000;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % MARKET_STATS.length);
        }, Math.max(500, speed));
        return () => clearInterval(timer);
    }, [simulationState]);

    const currentStat = MARKET_STATS[currentIndex];

    return (
        <div className="absolute top-4 left-4 lg:top-6 lg:right-6 lg:left-auto z-20 pointer-events-none">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] lg:text-xs font-mono text-green-500 uppercase tracking-wider">Live</span>
            </div>

            <div className="relative h-16 lg:h-24 w-48 lg:w-64">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-4"
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-xs text-gray-400 uppercase tracking-wide">{currentStat.category}</span>
                            <Activity className="w-3 h-3 text-primary/70" />
                        </div>

                        <div className="text-2xl font-bold text-white font-outfit mb-1">
                            {currentStat.value}
                        </div>

                        <div className="text-sm text-gray-300">
                            {currentStat.label}
                        </div>

                        {currentStat.trend && (
                            <div className="absolute bottom-4 right-4 text-xs font-mono text-green-400">
                                {currentStat.trend}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
