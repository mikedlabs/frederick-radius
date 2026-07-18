"use client";

import { DEMO_DATA } from "@/lib/data";
import { GlassCard } from "@/components/ui/glass-card";
import { motion } from "framer-motion";

export default function CommunityScene() {
    return (
        <div className="w-full h-full flex items-center justify-center px-4">
            <div className="max-w-6xl w-full">
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-6xl font-bold mb-6 font-outfit">
                        12 Communities. <br />
                        <span className="text-primary">One Platform.</span>
                    </h2>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Frederick Radius connects local information across Frederick City and the county&rsquo;s surrounding communities.
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {DEMO_DATA.municipalities.map((muni, index) => (
                        <motion.div
                            key={muni.name}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <GlassCard className="p-6 h-full hover:bg-white/10 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs text-gray-500 uppercase">{muni.type}</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">
                                    {muni.name}
                                </h3>
                                <p className="text-sm text-gray-400">{muni.highlight}</p>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
