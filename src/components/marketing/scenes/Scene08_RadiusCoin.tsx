"use client";

import { motion } from "framer-motion";
import { RADIUS_COIN } from "@/data/city-data-engine";
import { Coins, Sparkles } from "lucide-react";

/**
 * SCENE 8: THE RADIUS COIN (Rewards)
 * 3D metallic coin loop with rim-lighting and soft bloom
 * Premium exclusivity tone
 */
export default function Scene08_RadiusCoin() {
    return (
        <div className="relative w-full h-full bg-gradient-to-br from-[#0a0118] via-[#030014] to-[#0f0520] overflow-hidden flex items-center justify-center">
            {/* Title */}
            <div className="absolute top-16 left-1/2 -translate-x-1/2 text-center z-20">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                >
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <Sparkles className="w-8 h-8 text-amber-400" />
                        <h2 className="text-6xl font-light text-white tracking-tight">
                            Radius <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent font-semibold">Coin</span>
                        </h2>
                        <Sparkles className="w-8 h-8 text-amber-400" />
                    </div>
                    <p className="text-gray-400 text-xl font-light">
                        {RADIUS_COIN.concept}
                    </p>
                </motion.div>
            </div>

            {/* 3D Coin (Simulated) */}
            <div className="relative">
                <motion.div
                    className="relative w-80 h-80 rounded-full"
                    animate={{
                        rotateY: [0, 360],
                    }}
                    transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    style={{
                        transformStyle: "preserve-3d",
                    }}
                >
                    {/* Coin Face */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 flex items-center justify-center shadow-2xl border-8 border-amber-400/30">
                        {/* Inner Glow */}
                        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-amber-400/50 to-orange-500/50 blur-xl" />

                        {/* Icon */}
                        <div className="relative z-10">
                            <Coins className="w-32 h-32 text-amber-900/40" strokeWidth={1.5} />
                        </div>

                        {/* Rim Lighting */}
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-black/40" style={{
                            maskImage: "radial-gradient(circle, transparent 70%, black 100%)"
                        }} />
                    </div>

                    {/* Bloom Effect */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 blur-3xl opacity-60 animate-pulse" />
                </motion.div>

                {/* Floating Particles */}
                {[...Array(8)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full bg-amber-400"
                        style={{
                            top: "50%",
                            left: "50%",
                        }}
                        animate={{
                            x: [0, Math.cos(i * 45 * Math.PI / 180) * 200],
                            y: [0, Math.sin(i * 45 * Math.PI / 180) * 200],
                            opacity: [0, 1, 0],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            delay: i * 0.3,
                            ease: "easeOut"
                        }}
                    />
                ))}
            </div>

            {/* Bottom Content */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-full max-w-5xl px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Earn */}
                    <motion.div
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1, duration: 1 }}
                    >
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="text-2xl">🎯</span> Earn Coins
                        </h3>
                        <div className="space-y-2">
                            {RADIUS_COIN.earnOpportunities.slice(0, 4).map((opportunity, i) => (
                                <motion.div
                                    key={i}
                                    className="flex items-center justify-between text-sm"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 1.2 + i * 0.1 }}
                                >
                                    <span className="text-gray-300">{opportunity.action}</span>
                                    <span className="text-amber-400 font-semibold">+{opportunity.coins}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Redeem */}
                    <motion.div
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1, duration: 1 }}
                    >
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="text-2xl">🎁</span> Redeem Rewards
                        </h3>
                        <div className="space-y-3">
                            <div className="text-gray-300 text-sm">
                                Use your Radius Coins at {RADIUS_COIN.redeemPartners}+ partner businesses across Frederick County.
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
                                <Coins className="w-5 h-5 text-amber-400" />
                                <div>
                                    <div className="text-xs text-gray-400">Total Circulating</div>
                                    <div className="text-lg font-semibold text-white">{RADIUS_COIN.totalCirculating}</div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Background Elements */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-gradient-to-r from-amber-600/20 to-orange-600/20 rounded-full blur-3xl -z-10" />
        </div>
    );
}
