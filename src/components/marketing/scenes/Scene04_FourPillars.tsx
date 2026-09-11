"use client";

import { motion } from "framer-motion";
import { PILLARS } from "@/data/city-data-engine";
import { Store, Calendar, Coins, Building2 } from "lucide-react";

/**
 * SCENE 4: THE FOUR PILLARS (Apple-Style Grid)
 * Bento-box grid layout with staggered entry animation
 * Modules: Business Directory, Events, Rewards, City Services
 */
export default function Scene04_FourPillars() {
    const iconMap: Record<string, React.ReactNode> = {
        Store: <Store className="w-8 h-8" />,
        Calendar: <Calendar className="w-8 h-8" />,
        Coins: <Coins className="w-8 h-8" />,
        Building2: <Building2 className="w-8 h-8" />,
    };

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#030014] via-[#0a0118] to-[#0f0520] overflow-hidden flex items-center justify-center p-8">
            {/* Header */}
            <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-6xl font-light text-white tracking-tight mb-3">
                        The Four <span className="bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent">Pillars</span>
                    </h2>
                    <p className="text-gray-400 text-xl font-light">
                        What is working, what is being tested, and what remains a concept
                    </p>
                </motion.div>
            </div>

            {/* Bento Grid */}
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 mt-32">
                {PILLARS.map((pillar, index) => {
                    const Icon = iconMap[pillar.icon];

                    return (
                        <motion.div
                            key={pillar.id}
                            className="group relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-500 overflow-hidden"
                            initial={{ opacity: 0, y: 40, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{
                                delay: index * 0.15,
                                duration: 0.8,
                                ease: [0.22, 1, 0.36, 1]
                            }}
                            whileHover={{ scale: 1.02 }}
                        >
                            {/* Gradient Background */}
                            <div className={`absolute -inset-20 bg-gradient-to-br ${pillar.color} opacity-0 group-hover:opacity-20 blur-3xl transition-opacity duration-700 -z-10`} />

                            {/* Icon */}
                            <motion.div
                                className={`inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br ${pillar.color} mb-6 shadow-lg`}
                                whileHover={{ rotate: 5, scale: 1.1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="text-white">{Icon}</div>
                            </motion.div>

                            {/* Content */}
                            <h3 className="text-3xl font-semibold text-white mb-3 tracking-tight">
                                {pillar.title}
                            </h3>
                            <p className="text-gray-400 text-base leading-relaxed mb-6">
                                {pillar.description}
                            </p>

                            {/* Stats Badge */}
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
                                <div
                                    className={`w-2 h-2 rounded-full ${pillar.stats === "Concept only" ? "bg-amber-300" : "bg-violet-300"}`}
                                />
                                <span className="text-sm text-gray-300 font-medium">{pillar.stats}</span>
                            </div>

                            {/* Hover Glow Line */}
                            <motion.div
                                className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${pillar.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                                initial={{ scaleX: 0 }}
                                whileHover={{ scaleX: 1 }}
                                transition={{ duration: 0.5 }}
                            />
                        </motion.div>
                    );
                })}
            </div>

            {/* Ambient Elements */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-amber-600/10 rounded-full blur-3xl -z-10" />
        </div>
    );
}
