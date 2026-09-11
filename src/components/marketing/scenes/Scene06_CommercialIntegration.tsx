"use client";

import { motion } from "framer-motion";
import { BarChart3, CalendarDays, MapPin, PencilLine, ShieldCheck, Store } from "lucide-react";

const OWNER_TOOL_CONCEPTS = [
    {
        label: "Listing review",
        description: "See how public business details are presented.",
        status: "Beta direction",
        icon: Store,
    },
    {
        label: "Correction requests",
        description: "Visitors can flag an inaccurate detail for review.",
        status: "Limited beta",
        icon: PencilLine,
    },
    {
        label: "Event visibility",
        description: "Understand where a submitted event could appear.",
        status: "Exploration",
        icon: CalendarDays,
    },
    {
        label: "Performance analytics",
        description: "Would require consent, real measurement, and clear definitions.",
        status: "Not launched",
        icon: BarChart3,
    },
] as const;

/**
 * SCENE 6: BUSINESS EXPERIENCE CONCEPT
 * Deliberately avoids presenting fictional businesses or analytics as live.
 */
export default function Scene06_CommercialIntegration() {
    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520] px-8 py-28">
            <div className="relative z-10 w-full max-w-7xl">
                <motion.div
                    className="mb-10 text-center"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.28em] text-blue-300">
                        Concept direction
                    </p>
                    <h2 className="mb-3 text-5xl font-light tracking-tight text-white">
                        A clearer experience for <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">local businesses</span>
                    </h2>
                    <p className="text-lg font-light text-gray-400">
                        Business owners can correct profiles through a transparent workflow. No analytics are invented.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <motion.section
                        aria-labelledby="example-profile-heading"
                        className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.3 }}
                    >
                        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-200">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Example profile, not a real business listing
                        </div>

                        <div className="mb-8 flex items-start gap-5">
                            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-3xl font-bold text-white shadow-xl">
                                EX
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 id="example-profile-heading" className="mb-1 text-3xl font-semibold text-white">
                                    Example local business
                                </h3>
                                <p className="mb-4 text-sm text-gray-400">Product-interface preview</p>
                                <div className="flex items-center gap-2 text-gray-300">
                                    <MapPin className="h-5 w-5 text-blue-400" aria-hidden="true" />
                                    <span className="text-sm">Frederick, Maryland</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
                            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-500">
                                The useful job
                            </p>
                            <p className="text-lg leading-relaxed text-gray-200">
                                Make it obvious what Radius knows, where a detail came from, and how an owner can request a correction.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3" aria-label="Disabled concept actions">
                            <button
                                type="button"
                                disabled
                                className="cursor-not-allowed rounded-xl bg-gradient-to-r from-violet-500/60 to-purple-600/60 px-5 py-3 font-medium text-white/75"
                            >
                                Profile preview
                            </button>
                            <button
                                type="button"
                                disabled
                                className="cursor-not-allowed rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium text-white/60"
                            >
                                Concept only
                            </button>
                        </div>

                        <div className="pointer-events-none absolute -inset-20 -z-10 bg-gradient-to-br from-violet-600/20 to-purple-600/20 blur-3xl" />
                    </motion.section>

                    <motion.section
                        aria-labelledby="owner-tools-heading"
                        className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.3 }}
                    >
                        <h3 id="owner-tools-heading" className="mb-6 text-2xl font-semibold text-white">
                            Possible owner tools
                        </h3>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {OWNER_TOOL_CONCEPTS.map((tool, index) => {
                                const Icon = tool.icon;
                                return (
                                    <motion.div
                                        key={tool.label}
                                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                                    >
                                        <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-2.5">
                                            <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                                        </div>
                                        <div className="mb-1 text-base font-semibold text-white">{tool.label}</div>
                                        <p className="mb-3 text-sm leading-relaxed text-gray-400">{tool.description}</p>
                                        <span className="text-xs font-medium uppercase tracking-wider text-cyan-300">
                                            {tool.status}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <div className="mt-6 rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-5">
                            <h4 className="mb-2 text-base font-semibold text-white">What this slide does not claim</h4>
                            <p className="text-sm leading-relaxed text-gray-300">
                                Radius does not currently claim foot-traffic measurement, paid reach, enterprise analytics, or customer counts.
                            </p>
                        </div>
                    </motion.section>
                </div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
        </div>
    );
}
