"use client";

import { motion } from "framer-motion";
import { Map, Home, TrendingUp } from "lucide-react";
import { LENS_MODES, LensMode } from "@/data/frederick-data";
import { cn } from "@/lib/utils";

interface CityLensControlProps {
    currentMode: LensMode;
    onModeChange: (mode: LensMode) => void;
}

const ICONS = {
    visitor: Map,
    resident: Home,
    investor: TrendingUp,
};

export function CityLensControl({ currentMode, onModeChange }: CityLensControlProps) {
    return (
        <div className="absolute bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-1 lg:gap-2 p-1 lg:p-1.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
            {LENS_MODES.map((mode) => {
                const Icon = ICONS[mode.id as LensMode];
                const isActive = currentMode === mode.id;

                return (
                    <button
                        key={mode.id}
                        onClick={() => onModeChange(mode.id as LensMode)}
                        className={cn(
                            "relative px-3 py-2 lg:px-6 lg:py-3 rounded-full flex items-center gap-2 transition-all duration-300 overflow-hidden group",
                            isActive ? "text-black" : "text-gray-400 hover:text-white"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="active-pill"
                                className="absolute inset-0 bg-white"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}

                        <span className="relative z-10 flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span className="hidden lg:inline font-medium text-sm">{mode.label}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
