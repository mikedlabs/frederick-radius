"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FlaskConical, Lightbulb } from "lucide-react";
import { PRODUCT_STATUS } from "@/data/city-data-engine";

/**
 * SCENE 5: PRODUCT STATUS
 * Replaces invented telemetry and financial charts with the actual beta stage.
 */
export default function Scene05_DataStory() {
    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#030014] to-[#0a0118] px-8 py-28">
            <div className="relative z-10 w-full max-w-7xl">
                <motion.div
                    className="mb-10 text-center"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.28em] text-emerald-300">
                        Honest product view
                    </p>
                    <h2 className="mb-3 text-5xl font-light tracking-tight text-white">
                        Where Radius <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">actually stands</span>
                    </h2>
                    <p className="text-lg font-light text-gray-400">
                        No vanity metrics or invented revenue chart — just the beta, the tests, and the next decisions.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <motion.section
                        aria-labelledby="product-status-heading"
                        className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.3 }}
                    >
                        <h3 id="product-status-heading" className="mb-6 text-2xl font-semibold text-white">
                            Product status
                        </h3>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {PRODUCT_STATUS.cards.map((item, index) => {
                                const Icon = item.stage === "available"
                                    ? CheckCircle2
                                    : item.stage === "testing"
                                        ? FlaskConical
                                        : Lightbulb;
                                const tone = item.stage === "available"
                                    ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/20"
                                    : item.stage === "testing"
                                        ? "text-cyan-300 bg-cyan-400/10 border-cyan-400/20"
                                        : "text-amber-300 bg-amber-400/10 border-amber-400/20";

                                return (
                                    <motion.div
                                        key={item.label}
                                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                                    >
                                        <div className={`mb-4 inline-flex rounded-xl border p-2 ${tone}`}>
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                        </div>
                                        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">
                                            {item.label}
                                        </div>
                                        <div className="mb-2 text-xl font-semibold text-white">
                                            {item.value}
                                        </div>
                                        <p className="text-sm leading-relaxed text-gray-400">
                                            {item.detail}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.section>

                    <motion.section
                        aria-labelledby="roadmap-heading"
                        className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl"
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.3 }}
                    >
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <h3 id="roadmap-heading" className="text-2xl font-semibold text-white">
                                    Product roadmap
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">Sequence, not a performance forecast</p>
                            </div>
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">
                                Early-access beta
                            </span>
                        </div>

                        <div className="space-y-3">
                            {PRODUCT_STATUS.roadmap.map((step, index) => (
                                <motion.div
                                    key={step.period}
                                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.55 + index * 0.12, duration: 0.5 }}
                                >
                                    <div className="w-16 shrink-0 text-xs font-semibold uppercase tracking-widest text-cyan-300">
                                        {step.period}
                                    </div>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
                                    <div className="text-base text-gray-200">{step.outcome}</div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="mt-6 border-t border-white/10 pt-6">
                            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                                What guides the work
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {PRODUCT_STATUS.principles.map((principle) => (
                                    <span
                                        key={principle}
                                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300"
                                    >
                                        {principle}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </motion.section>
                </div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-600/10 to-cyan-600/10 blur-3xl" />
        </div>
    );
}
