"use client";

import { AnimatedButton } from "@/components/ui/animated-button";
import { GradientText } from "@/components/ui/gradient-text";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function VisionScene() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-black to-black" />

            <div className="relative z-10 max-w-4xl">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-8xl font-bold mb-8 font-outfit"
                >
                    The Future is <br />
                    <GradientText>Now.</GradientText>
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl md:text-2xl text-gray-300 mb-12 leading-relaxed"
                >
                    Frederick Radius is more than an app. It's the operating system for our community's growth.
                    Join us in building the most connected county in America.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-6"
                >
                    <AnimatedButton className="w-full sm:w-auto text-lg px-10 py-6">
                        Partner With Us <ArrowRight className="ml-2 w-5 h-5" />
                    </AnimatedButton>
                    <AnimatedButton variant="outline" className="w-full sm:w-auto text-lg px-10 py-6">
                        Download Prospectus
                    </AnimatedButton>
                </motion.div>
            </div>

            <div className="absolute bottom-8 text-gray-600 text-sm">
                © 2025 Frederick Radius. All Rights Reserved.
            </div>
        </div>
    );
}
