"use client";

import { motion } from "framer-motion";
import { X, Zap } from "lucide-react";
import { DEMOGRAPHICS } from "@/data/city-data-engine";

/**
 * SCENE 3: THE NOISE VS. THE SIGNAL
 * Visual metaphor: Chaotic fragmented apps dissolve into a single Radius line
 * Copy: "One ecosystem for [X] residents"
 */
export default function Scene03_NoiseToSignal() {
    // Fragmented app icons (representing the chaos)
    const fragmentedApps = [
        "Facebook", "Twitter", "Nextdoor", "Yelp", "Eventbrite",
        "Instagram", "Calendars", "Email", "News", "Maps", "Gov Portal", "Community Board"
    ];

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520] overflow-hidden">
            {/* Title */}
            <motion.div
                className="absolute top-20 left-1/2 -translate-x-1/2 z-20 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 1 }}
            >
                <h2 className="text-5xl font-light text-white tracking-tight mb-4">
                    The <span className="text-red-500">Problem</span>
                </h2>
                <p className="text-gray-400 text-xl font-light">
                    Information scattered across endless platforms
                </p>
            </motion.div>

            {/* CHAOS LAYER: Fragmented App Icons */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[800px] h-[600px]">
                    {fragmentedApps.map((app, index) => {
                        const angle = (index / fragmentedApps.length) * Math.PI * 2;
                        const radius = 250;
                        const x = Math.cos(angle) * radius;
                        const y = Math.sin(angle) * radius;

                        return (
                            <motion.div
                                key={app}
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                animate={{
                                    x,
                                    y,
                                    opacity: [1, 1, 0],
                                    scale: [1, 1.2, 0],
                                    rotate: [0, 180, 360]
                                }}
                                transition={{
                                    duration: 3,
                                    delay: index * 0.05,
                                    times: [0, 0.6, 1],
                                    ease: [0.43, 0.13, 0.23, 0.96]
                                }}
                            >
                                <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-xl p-4 shadow-xl min-w-[120px]">
                                    <div className="flex items-center gap-2 mb-1">
                                        <X className="w-4 h-4 text-red-400" />
                                        <span className="text-xs text-white font-medium">{app}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500">Disconnected</div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* SIGNAL LAYER: The Radius Line */}
            <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3, duration: 1.5 }}
            >
                <div className="text-center">
                    {/* The Line (Radius Vector) */}
                    <motion.div
                        className="relative mx-auto mb-12"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 3.5, duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="h-1 w-[400px] bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.6)]" />

                        {/* Center Glow */}
                        <motion.div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_40px_rgba(255,255,255,0.8)]"
                            animate={{
                                scale: [1, 1.5, 1],
                                opacity: [1, 0.6, 1]
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                        />
                    </motion.div>

                    {/* Logo */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 4, duration: 1 }}
                        className="mb-8"
                    >
                        <div className="flex items-center justify-center gap-3 mb-2">
                            <Zap className="w-8 h-8 text-amber-400" />
                            <h1 className="text-6xl font-light text-white tracking-tight">
                                Frederick <span className="bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent font-semibold">Radius</span>
                            </h1>
                        </div>
                        <div className="text-xl text-gray-400 font-light">
                            One clean signal. Zero noise.
                        </div>
                    </motion.div>

                    {/* The Copy */}
                    <motion.div
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-10 max-w-2xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 4.5, duration: 1 }}
                    >
                        <p className="text-4xl font-light text-white leading-relaxed">
                            One ecosystem for{" "}
                            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-amber-400 bg-clip-text text-transparent font-semibold">
                                {DEMOGRAPHICS.population.total.toLocaleString()}+
                            </span>{" "}
                            residents
                        </p>
                        <div className="mt-6 pt-6 border-t border-white/10 text-gray-400 text-lg">
                            Every business. Every event. Every update. One beautiful interface.
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Ambient Background */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
        </div>
    );
}
