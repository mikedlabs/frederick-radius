"use client";

import { useState } from "react";
import InteractiveMap from "@/components/map";
import { motion } from "framer-motion";
import { CityLensControl } from "@/components/marketing/CityLensControl";
import { PulseOverlay } from "@/components/marketing/PulseOverlay";
import { LensMode } from "@/data/frederick-data";
import { CitySimulator, SimulationState } from "@/components/marketing/CitySimulator";

export default function MapHeroScene() {
    const [lensMode, setLensMode] = useState<LensMode>("visitor");
    const [simulationState, setSimulationState] = useState<SimulationState>({
        infrastructure: 50,
        marketing: 30,
        incentives: 40
    });

    return (
        <div className="w-full h-full relative flex items-center justify-center bg-black">
            {/* Data Overlay */}
            <PulseOverlay simulationState={simulationState} />

            <div className="absolute inset-0 z-0 opacity-60">
                <InteractiveMap lensMode={lensMode} simulationState={simulationState} />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#030014] via-transparent to-[#030014] pointer-events-none" />

            {/* Lens Control */}
            <CityLensControl currentMode={lensMode} onModeChange={setLensMode} />

            {/* City Simulator */}
            <CitySimulator onChange={setSimulationState} />

            {/* Main Content - Simplified */}
            <div className="relative z-10 max-w-4xl w-full px-6 lg:px-4 pointer-events-none mb-32 lg:mb-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="text-center lg:text-left"
                >
                    <h2 className="text-4xl lg:text-6xl font-bold mb-4 font-outfit leading-tight">
                        One Map. <br className="hidden lg:block" />
                        <span className="text-primary">Infinite Connection.</span>
                    </h2>
                    <p className="text-base lg:text-xl text-gray-400 max-w-2xl mx-auto lg:mx-0">
                        Real-time visualization across Frederick County
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
