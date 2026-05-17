"use client";

import { motion } from "framer-motion";
import { Mail, ArrowRight, Check } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { useState } from "react";

/**
 * SCENE 10: THE VISION (Call to Action)
 * Wide horizon shot, elegant email capture, minimal footer
 */
export default function Scene10_Vision() {
    const [email, setEmail] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
    };

    return (
        <div className="relative w-full h-full bg-gradient-to-b from-[#030014] via-[#0a0118] to-[#0f0520] overflow-hidden flex flex-col items-center justify-center p-8">
            {/* Wide Horizon Background */}
            <motion.div
                className="absolute inset-0 opacity-20"
                initial={{ scale: 1.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.2 }}
                transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="w-full h-full bg-gradient-to-b from-violet-950/40 via-purple-950/30 to-transparent" />
            </motion.div>

            {/* Main Content */}
            <div className="relative z-10 max-w-4xl text-center">
                {/* Vision Statement */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-12"
                >
                    <h1 className="text-7xl md:text-8xl font-light tracking-tight text-white mb-6 leading-none">
                        The Future of
                        <br />
                        <GradientText>Civic Connection</GradientText>
                    </h1>
                    <p className="text-2xl text-gray-400 font-light leading-relaxed max-w-3xl mx-auto">
                        Frederick Radius isn&apos;t just an app—it&apos;s the operating system for modern community life.
                        Join us in building a more connected, informed, and empowered Frederick County.
                    </p>
                </motion.div>

                {/* Email Capture */}
                {!isSubmitted ? (
                    <motion.form
                        onSubmit={handleSubmit}
                        className="relative max-w-2xl mx-auto mb-16"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 1 }}
                    >
                        {/* Glow */}
                        <div className="absolute -inset-4 bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 rounded-3xl blur-2xl opacity-30" />

                        <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
                            <Mail className="w-6 h-6 text-gray-400 ml-4" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email to join the waitlist"
                                required
                                className="flex-1 bg-transparent text-white text-lg placeholder-gray-500 outline-none py-4"
                            />
                            <motion.button
                                type="submit"
                                className="px-8 py-4 rounded-xl bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 text-white font-semibold shadow-lg flex items-center gap-2 group"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                            >
                                Join Waitlist
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </motion.button>
                        </div>

                        <p className="text-sm text-gray-500 mt-4">
                            Be the first to experience Frederick Radius. Launch: Q1 2026
                        </p>
                    </motion.form>
                ) : (
                    <motion.div
                        className="max-w-2xl mx-auto mb-16 backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full">
                                <Check className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <h3 className="text-3xl font-semibold text-white mb-2">
                            You&apos;re on the list!
                        </h3>
                        <p className="text-gray-400">
                            We&apos;ll keep you updated on launch progress and exclusive early access opportunities.
                        </p>
                    </motion.div>
                )}

                {/* Stats Grid */}
                <motion.div
                    className="grid grid-cols-3 gap-8 mb-16 max-w-3xl mx-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                >
                    <div className="text-center">
                        <div className="text-4xl font-light text-white mb-2">305K+</div>
                        <div className="text-sm text-gray-500 uppercase tracking-wider">Residents</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl font-light text-white mb-2">4,500+</div>
                        <div className="text-sm text-gray-500 uppercase tracking-wider">Businesses</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl font-light text-white mb-2">12</div>
                        <div className="text-sm text-gray-500 uppercase tracking-wider">Communities</div>
                    </div>
                </motion.div>
            </div>

            {/* Minimal Footer */}
            <motion.footer
                className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
            >
                <div className="flex items-center gap-8 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                            FR
                        </div>
                        <span className="font-medium">Frederick Radius</span>
                    </div>
                    <div className="h-4 w-px bg-gray-700" />
                    <span>© 2025 All rights reserved</span>
                    <div className="h-4 w-px bg-gray-700" />
                    <a href="#" className="hover:text-white transition-colors">Privacy</a>
                    <a href="#" className="hover:text-white transition-colors">Terms</a>
                </div>
            </motion.footer>

            {/* Background Elements */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#030014] to-transparent" />
        </div>
    );
}
