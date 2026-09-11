"use client";

import { motion } from "framer-motion";
import { Bell, Car, ExternalLink, FileText, Search } from "lucide-react";

const CIVIC_GUIDE_MODULES = [
    {
        id: "parking",
        icon: Car,
        title: "Public parking",
        description: "Organize garage locations and published information, with a reminder to verify rates and rules at the official source.",
        status: "Information + source links",
        color: "from-blue-500 to-cyan-600",
    },
    {
        id: "permits",
        icon: FileText,
        title: "Permits & licenses",
        description: "Help identify the right agency, then continue on its official site. Radius cannot accept, issue, or track an application.",
        status: "Referral only",
        color: "from-emerald-500 to-teal-600",
    },
    {
        id: "alerts",
        icon: Bell,
        title: "Published alerts",
        description: "Surface source-linked closure, weather, and event information when available. Emergency instructions come from official authorities.",
        status: "Source-linked updates",
        color: "from-orange-500 to-red-600",
    },
] as const;

const EXAMPLE_SEARCHES = ["Parking downtown", "Permit office", "Voting information", "Trash schedule"] as const;

/**
 * SCENE 9: CIVIC GUIDE CONCEPT
 * Demonstrates discovery and referrals, not government transactions.
 */
export default function Scene09_CivicHub() {
    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#030014] via-[#0a0118] to-[#0f0520] px-8 py-28">
            <div className="relative z-10 w-full max-w-6xl">
                <motion.div
                    className="mb-10 text-center"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.28em] text-emerald-300">
                        Civic guide concept
                    </p>
                    <h2 className="mb-3 text-6xl font-light tracking-tight text-white">
                        The <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">right official source</span>, faster
                    </h2>
                    <p className="text-xl font-light text-gray-400">
                        This is a path to public information, not a government portal.
                    </p>
                </motion.div>

                <motion.section
                    aria-labelledby="civic-search-preview-heading"
                    className="relative mx-auto mb-10 max-w-4xl"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 1 }}
                >
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 opacity-20 blur-xl" />
                    <div className="relative rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <h3 id="civic-search-preview-heading" className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                Interface preview
                            </h3>
                            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-400">
                                Non-functional concept
                            </span>
                        </div>

                        <div
                            role="img"
                            aria-label="Concept search field showing an example request for permit and parking information"
                            className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3"
                        >
                            <Search className="h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-lg text-gray-400">
                                Ask where to find parking, permits, schedules, or alerts…
                            </span>
                            <span className="hidden items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500/60 to-teal-600/60 px-4 py-2 text-sm font-medium text-white/80 sm:inline-flex">
                                Find a source
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4" aria-label="Example searches">
                            {EXAMPLE_SEARCHES.map((suggestion, index) => (
                                <motion.span
                                    key={suggestion}
                                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.6 + index * 0.1 }}
                                >
                                    {suggestion}
                                </motion.span>
                            ))}
                        </div>
                    </div>
                </motion.section>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {CIVIC_GUIDE_MODULES.map((module, index) => {
                        const Icon = module.icon;
                        return (
                            <motion.article
                                key={module.id}
                                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl transition-colors duration-500 hover:bg-white/10"
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.8 + index * 0.15, duration: 0.8 }}
                                whileHover={{ y: -4 }}
                            >
                                <div className={`absolute -inset-20 -z-10 bg-gradient-to-br ${module.color} opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-20`} />
                                <div className={`mb-6 inline-flex rounded-2xl bg-gradient-to-br p-4 shadow-lg ${module.color}`}>
                                    <Icon className="h-8 w-8 text-white" aria-hidden="true" />
                                </div>

                                <h3 className="mb-3 text-2xl font-semibold text-white">{module.title}</h3>
                                <p className="mb-6 text-sm leading-relaxed text-gray-400">{module.description}</p>

                                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-300" />
                                    <span className="text-xs font-medium text-gray-300">{module.status}</span>
                                </div>
                            </motion.article>
                        );
                    })}
                </div>

                <motion.div
                    className="mt-8 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 1 }}
                >
                    <p className="text-sm font-medium uppercase tracking-widest text-gray-500">Independent project</p>
                    <p className="mt-2 text-lg font-light text-white">
                        Official transactions stay on official government websites.
                    </p>
                </motion.div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-600/15 to-teal-600/15 blur-3xl" />
        </div>
    );
}
