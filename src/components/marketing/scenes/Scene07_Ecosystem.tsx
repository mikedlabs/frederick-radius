"use client";

import { motion } from "framer-motion";
import { PERSONAS } from "@/data/city-data-engine";
import { Home, MapPin, Store, Building2 } from "lucide-react";
import { useState } from "react";

/**
 * SCENE 7: THE ECOSYSTEM (Community)
 * Horizontal scroller with four honest beta use cases
 */
export default function Scene07_Ecosystem() {
    const [activePersona, setActivePersona] = useState(0);

    const iconMap: Record<string, React.ReactNode> = {
        Home: <Home className="w-8 h-8" />,
        MapPin: <MapPin className="w-8 h-8" />,
        Store: <Store className="w-8 h-8" />,
        Building2: <Building2 className="w-8 h-8" />,
    };

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#030014] via-[#0a0118] to-[#0f0520] overflow-hidden flex flex-col items-center justify-center p-8">
            {/* Header */}
            <div className="text-center mb-16 z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-6xl font-light text-white tracking-tight mb-3">
                        Built around <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">real local tasks</span>
                    </h2>
                    <p className="text-gray-400 text-xl font-light">
                        Different needs, one clearer starting point
                    </p>
                </motion.div>
            </div>

            {/* Horizontal Scroller */}
            <div className="w-full max-w-7xl overflow-x-auto scrollbar-hide">
                <div className="flex gap-6 pb-8">
                    {PERSONAS.map((persona, index) => {
                        const Icon = iconMap[persona.icon];
                        const isActive = activePersona === index;

                        return (
                            <motion.button
                                key={persona.id}
                                type="button"
                                className={`relative flex-shrink-0 w-80 backdrop-blur-xl border rounded-3xl p-8 transition-all duration-500 ${isActive
                                    ? "bg-white/10 border-white/30 scale-105"
                                    : "bg-white/5 border-white/10 hover:bg-white/10"
                                    } text-left`}
                                initial={{ opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.15, duration: 0.8 }}
                                onMouseEnter={() => setActivePersona(index)}
                                onFocus={() => setActivePersona(index)}
                                onClick={() => setActivePersona(index)}
                                whileHover={{ y: -8 }}
                            >
                                {/* Icon */}
                                <motion.div
                                    className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 mb-6 shadow-xl"
                                    animate={{
                                        rotate: isActive ? [0, 5, -5, 0] : 0,
                                        scale: isActive ? 1.1 : 1,
                                    }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <div className="text-white">{Icon}</div>
                                </motion.div>

                                {/* Title */}
                                <h3 className="text-3xl font-semibold text-white mb-2">
                                    {persona.name}
                                </h3>
                                <p className="text-sm text-gray-500 uppercase tracking-wider mb-4">
                                    {persona.primaryUse}
                                </p>

                                {/* Benefit */}
                                <p className="text-gray-300 leading-relaxed mb-6">
                                    {persona.benefit}
                                </p>

                                {/* Features */}
                                <div className="space-y-2">
                                    {persona.topFeatures.map((feature, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex items-center gap-2 text-sm text-gray-400"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.15 + i * 0.1 }}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                            {feature}
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Use-case Badge */}
                                <div className="mt-6 pt-6 border-t border-white/10">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
                                        <div className="w-2 h-2 rounded-full bg-purple-300" />
                                        <span className="text-xs text-gray-300 font-medium">
                                            {persona.useCase}
                                        </span>
                                    </div>
                                </div>

                                {/* Active Glow */}
                                {isActive && (
                                    <div className="absolute -inset-6 bg-gradient-to-br from-pink-600/30 via-purple-600/30 to-indigo-600/30 blur-3xl -z-10" />
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Principle */}
            <motion.div
                className="mt-12 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
            >
                <p className="text-gray-500 text-sm uppercase tracking-widest mb-2">
                    Product principle
                </p>
                <p className="text-3xl font-light text-white">
                    Earn usefulness first. <span className="text-gray-500">Measure adoption honestly.</span>
                </p>
            </motion.div>

            {/* Background */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
        </div>
    );
}
