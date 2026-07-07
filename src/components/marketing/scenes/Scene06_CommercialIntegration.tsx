"use client";

import { motion } from "framer-motion";
import { Eye, TrendingUp, MapPin, Users } from "lucide-react";

/**
 * SCENE 6: COMMERCIAL INTEGRATION
 * Split-screen: Business profile (left) + Live metrics (right)
 * Benefit: "Data-backed visibility"
 */
export default function Scene06_CommercialIntegration() {
    // Mock business data
    const businessProfile = {
        name: "The Tasting Room",
        category: "Wine Bar & Restaurant",
        address: "101 N Market St, Frederick, MD",
        rating: 4.8,
        reviews: 1247,
        hours: "Open • Closes 10 PM",
    };

    const liveMetrics = [
        { label: "Views This Week", value: "2,847", change: "+18%", icon: Eye },
        { label: "Foot Traffic", value: "1,234", change: "+24%", icon: Users },
        { label: "Engagement Rate", value: "12.3%", change: "+5.2%", icon: TrendingUp },
        { label: "Radius Reach", value: "15 mi", change: "Active", icon: MapPin },
    ];

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520] overflow-hidden flex items-center justify-center p-8">
            {/* Title */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-5xl font-light text-white tracking-tight mb-3">
                        For <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Businesses</span>
                    </h2>
                    <p className="text-gray-400 text-lg font-light">
                        Enterprise tools. Local focus.
                    </p>
                </motion.div>
            </div>

            {/* Split Screen Container */}
            <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 mt-24">
                {/* LEFT: Business Profile */}
                <motion.div
                    className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 overflow-hidden"
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, delay: 0.3 }}
                >
                    <div className="flex items-start gap-4 mb-6">
                        {/* Business Image Placeholder */}
                        <motion.div
                            className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl"
                            whileHover={{ scale: 1.05, rotate: 5 }}
                            transition={{ duration: 0.3 }}
                        >
                            TR
                        </motion.div>

                        <div className="flex-1">
                            <h3 className="text-2xl font-semibold text-white mb-1">
                                {businessProfile.name}
                            </h3>
                            <p className="text-sm text-gray-400 mb-2">
                                {businessProfile.category}
                            </p>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <span key={i} className={i < 5 ? "text-amber-400" : "text-gray-600"}>
                                            ★
                                        </span>
                                    ))}
                                </div>
                                <span className="text-sm text-gray-400">
                                    {businessProfile.rating} ({businessProfile.reviews} reviews)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-4 mb-6">
                        <div className="flex items-center gap-3 text-gray-300">
                            <MapPin className="w-5 h-5 text-blue-400" />
                            <span className="text-sm">{businessProfile.address}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-sm text-green-300 font-medium">{businessProfile.hours}</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
                            View Menu
                        </button>
                        <button className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-medium hover:bg-white/20 transition-all">
                            Get Directions
                        </button>
                    </div>

                    {/* Glow Effect */}
                    <div className="absolute -inset-20 bg-gradient-to-br from-violet-600/20 to-purple-600/20 blur-3xl -z-10" />
                </motion.div>

                {/* RIGHT: Live Metrics Dashboard */}
                <motion.div
                    className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, delay: 0.3 }}
                >
                    <h3 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
                        Live Analytics
                    </h3>

                    <div className="space-y-4">
                        {liveMetrics.map((metric, index) => {
                            const Icon = metric.icon;
                            return (
                                <motion.div
                                    key={metric.label}
                                    className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 + index * 0.1, duration: 0.6 }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-sm text-gray-400 uppercase tracking-wider">
                                                {metric.label}
                                            </span>
                                        </div>
                                        <span className="text-xs text-green-400 font-semibold">
                                            {metric.change}
                                        </span>
                                    </div>
                                    <div className="text-3xl font-semibold text-white">
                                        {metric.value}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* CTA */}
                    <motion.div
                        className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.5, duration: 1 }}
                    >
                        <h4 className="text-lg font-semibold text-white mb-2">
                            Data-Backed Visibility
                        </h4>
                        <p className="text-sm text-gray-300">
                            Every business sees who&apos;s finding them, what&apos;s working, and how to reach 305,000 county residents.
                        </p>
                    </motion.div>
                </motion.div>
            </div>

            {/* Background */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
        </div>
    );
}
