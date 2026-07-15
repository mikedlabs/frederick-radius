"use client";

import { motion } from "framer-motion";
import { SNAPSHOT } from "@/data/city-data-engine";
import { GradientText } from "@/components/ui/gradient-text";

/**
 * SCENE 1: THE CINEMATIC REVEAL
 * A slow-pan cinematic reveal with an honest product-status overview
 * Vibe: Confident, quiet luxury
 */
export default function Scene01_CinematicReveal() {
    return (
        <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520]">
            {/* Parallax Background Layers */}
            <motion.div
                className="absolute inset-0"
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.3 }}
                transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="w-full h-full bg-gradient-to-br from-violet-950/30 via-purple-950/20 to-amber-950/30 blur-sm" />
            </motion.div>

            {/* Glassmorphism Overlay Panel */}
            <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 2 }}
            >
                <div className="relative max-w-5xl mx-auto px-8">
                    {/* Data Snapshot HUD */}
                    <motion.div
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 shadow-2xl"
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 1.5, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* Title */}
                        <motion.div
                            className="text-center mb-12"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2, duration: 1 }}
                        >
                            <h1 className="text-7xl md:text-8xl font-light tracking-tight text-white mb-4 font-serif">
                                Frederick <GradientText>Radius</GradientText>
                            </h1>
                            <p className="text-xl text-gray-400 font-light tracking-wide">
                                {SNAPSHOT.eyebrow}
                            </p>
                        </motion.div>

                        {/* Snapshot Grid */}
                        <motion.div
                            className="grid grid-cols-2 md:grid-cols-4 gap-8"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2.5, duration: 1 }}
                        >
                            <StatCard label="Stage" value={SNAPSHOT.stage} />
                            <StatCard label="Focus" value={SNAPSHOT.focus} />
                            <StatCard label="Project" value={SNAPSHOT.model} />
                            <StatCard label="Approach" value={SNAPSHOT.posture} />
                        </motion.div>

                        {/* Tagline */}
                        <motion.div
                            className="text-center mt-12 pt-8 border-t border-white/10"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 3, duration: 1 }}
                        >
                            <p className="text-2xl font-light text-white tracking-wide">
                                {SNAPSHOT.tagline}
                            </p>
                        </motion.div>
                    </motion.div>

                    {/* Ambient Glow */}
                    <div className="absolute -inset-20 bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-amber-600/20 blur-3xl -z-10 opacity-50" />
                </div>
            </motion.div>

            {/* Subtle Grid Pattern */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <div className="text-4xl font-light text-white mb-2 font-mono tracking-tight">
                {value}
            </div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">
                {label}
            </div>
        </div>
    );
}
