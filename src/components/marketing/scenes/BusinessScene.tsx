"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { motion } from "framer-motion";
import { BarChart3, Users, TrendingUp, Activity } from "lucide-react";

export default function BusinessScene() {
    return (
        <div className="w-full h-full flex items-center justify-center px-4 bg-gradient-to-b from-[#030014] to-black">
            <div className="max-w-7xl w-full grid lg:grid-cols-2 gap-16 items-center">
                <div>
                    <h2 className="text-4xl md:text-6xl font-bold mb-8 font-outfit">
                        Empowering <br />
                        Local Business
                    </h2>
                    <p className="text-xl text-gray-400 mb-8 leading-relaxed">
                        Enterprise-grade tools for local entrepreneurs. Real-time analytics, location-based promotions, and customer insights that traditional platforms can't match.
                    </p>

                    <div className="space-y-4">
                        {[
                            { icon: Activity, title: "Real-Time Foot Traffic", desc: "Track visitor density in your radius" },
                            { icon: Users, title: "Customer Demographics", desc: "Know who is visiting and when" },
                            { icon: TrendingUp, title: "ROI Tracking", desc: "Measure campaign performance instantly" },
                        ].map((item, i) => (
                            <GlassCard key={i} className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-primary/20 text-primary">
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">{item.title}</h4>
                                    <p className="text-sm text-gray-400">{item.desc}</p>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </div>

                <div className="relative">
                    {/* Dashboard Mockup */}
                    <GlassCard className="p-6 !bg-[#0a0a0a] border-white/10 shadow-2xl">
                        <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                            </div>
                            <div className="text-xs text-gray-500 font-mono">business.frederickradius.app</div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            {[
                                { label: "Total Visitors", val: "1,245", change: "+12%" },
                                { label: "Revenue", val: "$12.4k", change: "+8%" },
                                { label: "Active Deals", val: "3", change: "Active" },
                            ].map((stat, i) => (
                                <div key={i} className="p-4 rounded-xl bg-white/5">
                                    <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
                                    <div className="text-xl font-bold text-white">{stat.val}</div>
                                    <div className="text-xs text-green-400 mt-1">{stat.change}</div>
                                </div>
                            ))}
                        </div>

                        <div className="h-48 w-full bg-white/5 rounded-xl flex items-end justify-between p-4 gap-2">
                            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    whileInView={{ height: `${h}%` }}
                                    transition={{ duration: 1, delay: i * 0.1 }}
                                    className="w-full bg-gradient-to-t from-primary/20 to-primary rounded-t-sm"
                                />
                            ))}
                        </div>
                    </GlassCard>

                    {/* Floating Notification */}
                    <motion.div
                        initial={{ x: 50, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="absolute -right-8 top-20"
                    >
                        <GlassCard className="p-4 flex gap-3 !bg-black/80 backdrop-blur-xl border-primary/50">
                            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                                <Bell className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">New Review</div>
                                <div className="text-xs text-gray-400">5 stars from Sarah M.</div>
                            </div>
                        </GlassCard>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

import { Bell } from "lucide-react";
