"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";

export interface SimulationState {
    infrastructure: number;
    marketing: number;
    incentives: number;
}

interface CitySimulatorProps {
    onChange: (state: SimulationState) => void;
}

export function CitySimulator({ onChange }: CitySimulatorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<SimulationState>({
        infrastructure: 50,
        marketing: 30,
        incentives: 40,
    });

    const metrics = useMemo(() => {
        const impact = 560 + (state.infrastructure * 2) + (state.incentives * 3);
        const visitors = 1.9 + (state.marketing * 0.05) + (state.infrastructure * 0.01);
        return {
            impact: Math.round(impact),
            visitors: Number(visitors.toFixed(1)),
        };
    }, [state]);

    useEffect(() => {
        onChange(state);
    }, [state, onChange]);

    const handleSliderChange = (key: keyof SimulationState, value: number) => {
        setState(prev => ({ ...prev, [key]: value }));
    };

    return (
        <>
            {/* Mobile: Bottom Drawer */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[1000] pointer-events-auto">
                <motion.div
                    initial={false}
                    animate={{ y: isOpen ? 0 : 280 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="bg-black/95 backdrop-blur-2xl border-t border-white/10"
                >
                    {/* Header - Always Visible */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="w-full px-6 py-4 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="text-sm font-bold text-white font-outfit">City Simulator</span>
                            <div className="flex gap-2 text-xs text-gray-400">
                                <span>${metrics.impact}M</span>
                                <span>•</span>
                                <span>{metrics.visitors}M visitors</span>
                            </div>
                        </div>
                        {isOpen ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                        )}
                    </button>

                    {/* Expandable Content */}
                    <div className="px-6 pb-8 space-y-6">
                        <SliderControl
                            label="Infrastructure"
                            value={state.infrastructure}
                            onChange={(v) => handleSliderChange("infrastructure", v)}
                            color="violet"
                        />
                        <SliderControl
                            label="Marketing"
                            value={state.marketing}
                            onChange={(v) => handleSliderChange("marketing", v)}
                            color="green"
                        />
                        <SliderControl
                            label="Incentives"
                            value={state.incentives}
                            onChange={(v) => handleSliderChange("incentives", v)}
                            color="blue"
                        />
                    </div>
                </motion.div>
            </div>

            {/* Desktop: Side Panel */}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="hidden lg:block fixed top-24 right-6 z-[1000] w-80 pointer-events-auto"
            >
                <div className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-bold text-white font-outfit">City Simulator</h3>
                    </div>

                    <div className="space-y-6 mb-6">
                        <SliderControl
                            label="Infrastructure"
                            value={state.infrastructure}
                            onChange={(v) => handleSliderChange("infrastructure", v)}
                            color="violet"
                        />
                        <SliderControl
                            label="Marketing"
                            value={state.marketing}
                            onChange={(v) => handleSliderChange("marketing", v)}
                            color="green"
                        />
                        <SliderControl
                            label="Incentives"
                            value={state.incentives}
                            onChange={(v) => handleSliderChange("incentives", v)}
                            color="blue"
                        />
                    </div>

                    <div className="pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Impact</div>
                            <div className="text-2xl font-bold text-white font-outfit">${metrics.impact}M</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Visitors</div>
                            <div className="text-2xl font-bold text-white font-outfit">{metrics.visitors}M</div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </>
    );
}

interface SliderControlProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    color: "violet" | "green" | "blue";
}

function SliderControl({ label, value, onChange, color }: SliderControlProps) {
    const colorClasses = {
        violet: "accent-violet-500",
        green: "accent-green-500",
        blue: "accent-blue-500",
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-baseline">
                <span className="text-sm text-gray-300">{label}</span>
                <span className="text-lg font-bold text-white font-outfit">{value}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className={`w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer ${colorClasses[color]} touch-manipulation`}
            />
        </div>
    );
}
