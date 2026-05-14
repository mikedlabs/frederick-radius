"use client";

import { motion } from "framer-motion";
import { Search, Car, FileText, Bell } from "lucide-react";

/**
 * SCENE 9: THE CIVIC HUB
 * Modules: Parking, Permits, Alerts
 * Feature: "Ask Frederick" search bar
 */
export default function Scene09_CivicHub() {
    const civicModules = [
        {
            id: "parking",
            icon: Car,
            title: "Smart Parking",
            description: "Real-time parking availability across all municipal lots",
            stat: "342 spots available",
            color: "from-blue-500 to-cyan-600"
        },
        {
            id: "permits",
            icon: FileText,
            title: "Permits & Licenses",
            description: "Apply, track, and manage all permits digitally",
            stat: "24/7 access",
            color: "from-emerald-500 to-teal-600"
        },
        {
            id: "alerts",
            icon: Bell,
            title: "Civic Alerts",
            description: "Live notifications for road closures, weather, and events",
            stat: "3 active alerts",
            color: "from-orange-500 to-red-600"
        }
    ];

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#030014] via-[#0a0118] to-[#0f0520] overflow-hidden flex flex-col items-center justify-center p-8">
            {/* Header */}
            <div className="text-center mb-12 z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-6xl font-light text-white tracking-tight mb-3">
                        The <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Civic Hub</span>
                    </h2>
                    <p className="text-gray-400 text-xl font-light">
                        Government services, simplified
                    </p>
                </motion.div>
            </div>

            {/* Ask Frederick Search */}
            <motion.div
                className="w-full max-w-4xl mb-16 z-20"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 1 }}
            >
                <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-xl opacity-20" />
                    <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center gap-4">
                            <Search className="w-6 h-6 text-emerald-400" />
                            <input
                                type="text"
                                placeholder='Ask Frederick anything... "Where can I renew my license?" or "Road closures downtown?"'
                                className="flex-1 bg-transparent text-white text-lg placeholder-gray-500 outline-none"
                            />
                            <motion.button
                                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                Search
                            </motion.button>
                        </div>

                        {/* Quick Suggestions */}
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
                            {["Parking downtown", "Building permits", "Voting locations", "Trash schedule"].map((suggestion, i) => (
                                <motion.button
                                    key={i}
                                    className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-all"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.6 + i * 0.1 }}
                                    whileHover={{ scale: 1.05 }}
                                >
                                    {suggestion}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Civic Modules Grid */}
            <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
                {civicModules.map((module, index) => {
                    const Icon = module.icon;
                    return (
                        <motion.div
                            key={module.id}
                            className="group relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-500 cursor-pointer overflow-hidden"
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1 + index * 0.15, duration: 0.8 }}
                            whileHover={{ scale: 1.03, y: -4 }}
                        >
                            {/* Background Gradient */}
                            <div className={`absolute -inset-20 bg-gradient-to-br ${module.color} opacity-0 group-hover:opacity-20 blur-3xl transition-opacity duration-700 -z-10`} />

                            {/* Icon */}
                            <motion.div
                                className={`inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br ${module.color} mb-6 shadow-lg`}
                                whileHover={{ rotate: 5, scale: 1.1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <Icon className="w-8 h-8 text-white" />
                            </motion.div>

                            {/* Content */}
                            <h3 className="text-2xl font-semibold text-white mb-3">
                                {module.title}
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-6">
                                {module.description}
                            </p>

                            {/* Stat */}
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20">
                                <div className={`w-2 h-2 rounded-full ${module.id === "alerts" ? "bg-red-400 animate-pulse" : "bg-green-400"}`} />
                                <span className="text-sm text-gray-300 font-medium">{module.stat}</span>
                            </div>

                            {/* Hover Line */}
                            <motion.div
                                className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${module.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                            />
                        </motion.div>
                    );
                })}
            </div>

            {/* Bottom CTA */}
            <motion.div
                className="mt-12 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 1 }}
            >
                <p className="text-gray-500 text-sm uppercase tracking-widest mb-2">
                    Powered by
                </p>
                <p className="text-2xl font-light text-white">
                    Frederick County <span className="text-emerald-400">Open Data Initiative</span>
                </p>
            </motion.div>

            {/* Background Elements */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-emerald-600/20 to-teal-600/20 rounded-full blur-3xl -z-10" />
        </div>
    );
}
