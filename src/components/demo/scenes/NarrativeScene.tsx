"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

interface NarrativeSceneProps {
    title: string;
    subtitle: string;
    content: string;
    alignment?: "left" | "right" | "center";
    highlight?: string;
}

export default function NarrativeScene({ title, subtitle, content, alignment = "left", highlight }: NarrativeSceneProps) {
    return (
        <div className="w-full h-full flex items-center justify-center px-4 relative pointer-events-none">
            <div className={cn(
                "max-w-6xl w-full flex",
                alignment === "center" ? "justify-center" : alignment === "right" ? "justify-end" : "justify-start"
            )}>
                <GlassCard className="max-w-xl p-8 !bg-black/40 !backdrop-blur-xl border-white/10 pointer-events-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-primary font-mono text-sm uppercase tracking-wider mb-2 block">
                            {subtitle}
                        </span>
                        <h2 className="text-4xl font-bold text-white mb-6 font-outfit">
                            {title}
                        </h2>
                        <p className="text-lg text-gray-300 leading-relaxed">
                            {content}
                        </p>

                        {highlight && (
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <p className="text-xl font-medium text-white">
                                    {highlight}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </GlassCard>
            </div>
        </div>
    );
}
