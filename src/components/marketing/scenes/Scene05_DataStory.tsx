"use client";

import { motion } from "framer-motion";
import { METRICS, ECONOMY } from "@/data/city-data-engine";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * SCENE 5: THE DATA STORY (The "Google" Layer)
 * Interactive heat maps and charts from economic/demographic files
 * Clean, thin-line graphs with glowing data points
 */
export default function Scene05_DataStory() {
    return (
        <div className="relative w-full h-full bg-gradient-to-b from-[#030014] to-[#0a0118] overflow-hidden flex items-center justify-center p-8">
            {/* Header */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-5xl font-light text-white tracking-tight mb-3">
                        The Data <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Story</span>
                    </h2>
                    <p className="text-gray-400 text-lg font-light">
                        Real metrics. Real impact. Real time.
                    </p>
                </motion.div>
            </div>

            {/* Main Content Grid */}
            <div className="max-w-7xl w-full mt-24 grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* LEFT: Real-Time Metrics */}
                <motion.div
                    className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8"
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, delay: 0.3 }}
                >
                    <h3 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                        Live Metrics
                    </h3>

                    <div className="space-y-4">
                        {METRICS.realtime.map((item, index) => (
                            <motion.div
                                key={item.metric}
                                className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                            >
                                <div className="flex-1">
                                    <div className="text-sm text-gray-400 uppercase tracking-wider mb-1">
                                        {item.metric}
                                    </div>
                                    <div className="text-2xl font-semibold text-white">
                                        {item.value}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {item.change}
                                    </div>
                                </div>
                                <div className="ml-4">
                                    {item.trend === "up" && <TrendingUp className="w-6 h-6 text-green-400" />}
                                    {item.trend === "down" && <TrendingDown className="w-6 h-6 text-red-400" />}
                                    {item.trend === "stable" && <Minus className="w-6 h-6 text-gray-400" />}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* RIGHT: Growth Chart */}
                <motion.div
                    className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, delay: 0.3 }}
                >
                    <h3 className="text-2xl font-semibold text-white mb-6">
                        Growth Trajectory
                    </h3>

                    {/* Simple Line Chart */}
                    <div className="relative h-64 mt-8">
                        <svg width="100%" height="100%" viewBox="0 0 500 250" preserveAspectRatio="none">
                            {/* Grid Lines */}
                            {[0, 1, 2, 3, 4].map(i => (
                                <line
                                    key={i}
                                    x1="0"
                                    y1={i * 62.5}
                                    x2="500"
                                    y2={i * 62.5}
                                    stroke="rgba(255,255,255,0.05)"
                                    strokeWidth="1"
                                />
                            ))}

                            {/* Growth Line */}
                            <motion.path
                                d="M 50 200 L 200 120 L 350 60 L 450 20"
                                fill="none"
                                stroke="url(#gradient)"
                                strokeWidth="3"
                                strokeLinecap="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 2, delay: 0.8, ease: "easeOut" }}
                            />

                            {/* Gradient Definition */}
                            <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>

                            {/* Data Points */}
                            {[
                                { x: 50, y: 200 },
                                { x: 200, y: 120 },
                                { x: 350, y: 60 },
                                { x: 450, y: 20 },
                            ].map((point, index) => (
                                <motion.circle
                                    key={index}
                                    cx={point.x}
                                    cy={point.y}
                                    r="6"
                                    fill="#10b981"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 1 + index * 0.2, duration: 0.5 }}
                                    style={{
                                        filter: "drop-shadow(0 0 8px rgba(16, 185, 129, 0.8))"
                                    }}
                                />
                            ))}
                        </svg>

                        {/* Labels */}
                        <div className="flex justify-between mt-4 text-xs text-gray-500 px-2">
                            {METRICS.growth.map((q, i) => (
                                <div key={i} className="text-center">
                                    <div className="font-medium">{q.period}</div>
                                    <div className="text-emerald-400 font-semibold mt-1">{q.revenue}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* BOTTOM: Business Category Breakdown */}
            <motion.div
                className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-7xl px-8"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 1 }}
            >
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        Business Distribution
                    </h3>
                    <div className="flex gap-2 h-8 rounded-full overflow-hidden">
                        {ECONOMY.businessCategories.map((cat, index) => (
                            <motion.div
                                key={cat.type}
                                className="relative group cursor-pointer"
                                style={{
                                    width: `${cat.percentage}%`,
                                    backgroundColor: `hsl(${index * 60}, 70%, 50%)`
                                }}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 1.8 + index * 0.1, duration: 0.5 }}
                            >
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
                                    {cat.type}: {cat.count} ({cat.percentage}%)
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Background Elements */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
        </div>
    );
}
