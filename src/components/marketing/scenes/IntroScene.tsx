"use client";

import { GradientText } from "@/components/ui/gradient-text";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

export default function IntroScene() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-4 text-center relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1 }}
                className="z-10"
            >
                <span className="inline-block py-1 px-3 rounded-full bg-white/5 border border-white/10 text-sm font-medium mb-8 backdrop-blur-md text-gray-300">
                    The Future of Civic Tech
                </span>
                <h1 className="text-6xl md:text-9xl font-bold tracking-tighter mb-6 font-outfit">
                    Frederick<br />
                    <GradientText>Radius</GradientText>
                </h1>
                <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
                    A unified digital ecosystem connecting 12 communities, 4,500+ businesses, and 305,000+ residents.
                </p>
            </motion.div>

            <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute bottom-12 text-gray-500 flex flex-col items-center gap-2"
            >
                <span className="text-xs uppercase tracking-widest">Start the Tour</span>
                <ArrowDown className="w-5 h-5" />
            </motion.div>
        </div>
    );
}
