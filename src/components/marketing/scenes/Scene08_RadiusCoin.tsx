"use client";

import { motion } from "framer-motion";
import { Coins, ShieldCheck, Sparkles } from "lucide-react";
import { RADIUS_COIN } from "@/data/city-data-engine";

/**
 * SCENE 8: REWARDS CONCEPT
 * A visually rich concept screen with explicit non-launch disclosures.
 */
export default function Scene08_RadiusCoin() {
    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520] px-8 py-28">
            <div className="relative z-10 w-full max-w-6xl">
                <motion.div
                    className="mb-10 text-center"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        {RADIUS_COIN.status}
                    </div>
                    <div className="mb-3 flex items-center justify-center gap-3">
                        <Sparkles className="h-8 w-8 text-amber-400" aria-hidden="true" />
                        <h2 className="text-6xl font-light tracking-tight text-white">
                            Radius <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text font-semibold text-transparent">Rewards</span>
                        </h2>
                        <Sparkles className="h-8 w-8 text-amber-400" aria-hidden="true" />
                    </div>
                    <p className="mx-auto max-w-3xl text-xl font-light leading-relaxed text-gray-400">
                        {RADIUS_COIN.concept}
                    </p>
                </motion.div>

                <div className="grid items-center gap-10 lg:grid-cols-[320px_1fr]">
                    <motion.div
                        className="relative mx-auto h-72 w-72"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, duration: 1 }}
                    >
                        <motion.div
                            className="relative h-full w-full rounded-full"
                            animate={{ rotateY: [0, 360] }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            style={{ transformStyle: "preserve-3d" }}
                        >
                            <div className="absolute inset-0 flex items-center justify-center rounded-full border-8 border-amber-400/30 bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-2xl">
                                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-amber-400/50 to-orange-500/50 blur-xl" />
                                <div className="relative z-10 text-center">
                                    <Coins className="mx-auto h-24 w-24 text-amber-950/45" strokeWidth={1.5} aria-hidden="true" />
                                    <span className="mt-1 block text-xs font-bold uppercase tracking-[0.25em] text-amber-950/60">
                                        Concept
                                    </span>
                                </div>
                                <div
                                    className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-black/40"
                                    style={{ maskImage: "radial-gradient(circle, transparent 70%, black 100%)" }}
                                />
                            </div>
                            <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 opacity-60 blur-3xl" />
                        </motion.div>
                    </motion.div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <motion.section
                            aria-labelledby="reward-examples-heading"
                            className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6, duration: 0.8 }}
                        >
                            <h3 id="reward-examples-heading" className="mb-2 text-xl font-semibold text-white">
                                Ways it could work
                            </h3>
                            <p className="mb-5 text-sm leading-relaxed text-gray-500">
                                These actions are examples, not an active earning schedule.
                            </p>
                            <div className="space-y-3">
                                {RADIUS_COIN.earnOpportunities.map((opportunity, index) => (
                                    <motion.div
                                        key={opportunity.action}
                                        className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                                        initial={{ opacity: 0, x: -16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.8 + index * 0.1 }}
                                    >
                                        <span className="text-gray-300">{opportunity.action}</span>
                                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-amber-300">
                                            {opportunity.label}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>

                        <motion.section
                            aria-labelledby="reward-guardrails-heading"
                            className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6, duration: 0.8 }}
                        >
                            <h3 id="reward-guardrails-heading" className="mb-2 text-xl font-semibold text-white">
                                Before anything launches
                            </h3>
                            <p className="mb-5 text-sm leading-relaxed text-gray-500">
                                The concept needs real partners, clear terms, and safeguards first.
                            </p>

                            <div className="mb-4 space-y-3">
                                <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                                    {RADIUS_COIN.partnerStatus}
                                </div>
                                <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                                    {RADIUS_COIN.circulationStatus}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {RADIUS_COIN.requirements.map((requirement) => (
                                    <span
                                        key={requirement}
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300"
                                    >
                                        {requirement}
                                    </span>
                                ))}
                            </div>
                        </motion.section>
                    </div>
                </div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-600/15 to-orange-600/15 blur-3xl" />
        </div>
    );
}
