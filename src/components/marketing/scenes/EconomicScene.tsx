"use client";

import { DEMO_DATA } from "@/lib/data";
import { GlassCard } from "@/components/ui/glass-card";
import { motion } from "framer-motion";

function Counter({ value, label }: { value: string; label: string }) {
    return (
        <div className="text-center">
            <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 100 }}
                className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 font-outfit mb-2"
            >
                {value}
            </motion.div>
            <div className="text-sm md:text-base text-primary tracking-widest uppercase font-medium">{label}</div>
        </div>
    );
}

export default function EconomicScene() {
    return (
        <div className="w-full h-full flex items-center justify-center px-4 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px]" />

            <div className="max-w-6xl w-full z-10">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-6xl font-bold mb-6 font-outfit">Economic Powerhouse</h2>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Frederick County is thriving. We&apos;re capturing the value of a $560M tourism economy.
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
                    <Counter value={DEMO_DATA.impact.annual_economic_impact} label="Annual Impact" />
                    <Counter value={DEMO_DATA.impact.visitors_annual} label="Annual Visitors" />
                    <Counter value={DEMO_DATA.impact.total_businesses} label="Local Businesses" />
                    <Counter value={DEMO_DATA.business_stats.avg_spend_increase} label="Spend Increase" />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-20 grid md:grid-cols-2 gap-6"
                >
                    <GlassCard className="p-8">
                        <h3 className="text-xl font-bold mb-4 text-white">Visitor Retention</h3>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: "85%" }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-secondary"
                            />
                        </div>
                        <div className="mt-2 text-right text-secondary font-mono">85% Return Rate</div>
                    </GlassCard>

                    <GlassCard className="p-8">
                        <h3 className="text-xl font-bold mb-4 text-white">Local Patronage</h3>
                        <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: "75%" }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-primary"
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: "25%" }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="h-full bg-white/20"
                            />
                        </div>
                        <div className="mt-2 flex justify-between text-xs font-mono">
                            <span className="text-primary">75% Residents</span>
                            <span className="text-gray-400">25% Visitors</span>
                        </div>
                    </GlassCard>
                </motion.div>
            </div>
        </div>
    );
}
