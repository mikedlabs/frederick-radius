"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";

/**
 * SCENE 10: THE VISION
 * The access gate and its email sign-up are retired, so this scene sends
 * people straight into the app instead of collecting an address for a code
 * that no longer does anything.
 */
export default function Scene10_Vision() {
    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#030014] via-[#0a0118] to-[#0f0520] px-8 py-28">
            <motion.div
                className="absolute inset-0 opacity-20"
                initial={{ scale: 1.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.2 }}
                transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="h-full w-full bg-gradient-to-b from-violet-950/40 via-purple-950/30 to-transparent" />
            </motion.div>

            <div className="relative z-10 w-full max-w-4xl text-center">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-10"
                >
                    <p className="mb-4 text-sm font-medium uppercase tracking-[0.28em] text-violet-300">
                        Independent early-access beta
                    </p>
                    <h1 className="mb-6 text-6xl font-light leading-none tracking-tight text-white md:text-8xl">
                        Find what fits
                        <br />
                        <GradientText>your Frederick day</GradientText>
                    </h1>
                    <p className="mx-auto max-w-3xl text-xl font-light leading-relaxed text-gray-400 md:text-2xl">
                        Frederick Radius is a working local-discovery beta. The goal is simple: make places, events, and useful updates easier to find and easier to trust.
                    </p>
                </motion.div>

                <motion.div
                    className="relative mx-auto mb-12 max-w-2xl"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 1 }}
                >
                    <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 opacity-30 blur-2xl" />
                    <Link
                        href="/today"
                        prefetch={false}
                        className="group relative inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 px-8 py-4 text-lg font-semibold text-white shadow-lg"
                    >
                        Open Frederick Radius
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </Link>
                    <p className="relative mt-5 text-sm text-gray-400">
                        The app is open to everyone. It does not ask for a sign-up or an access code.
                    </p>
                </motion.div>

                <motion.div
                    className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                >
                    {[
                        { value: "Independent", label: "Project" },
                        { value: "Local-first", label: "Focus" },
                        { value: "Early-access beta", label: "Current stage" },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
                            <div className="mb-1 text-2xl font-light text-white">{item.value}</div>
                            <div className="text-xs uppercase tracking-wider text-gray-500">{item.label}</div>
                        </div>
                    ))}
                </motion.div>

                <motion.footer
                    className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 1 }}
                >
                    <span>© 2026 Frederick Radius</span>
                    <span aria-hidden="true">·</span>
                    <Link href="/terms" prefetch={false} className="transition-colors hover:text-white">Terms</Link>
                    <Link href="/privacy" prefetch={false} className="transition-colors hover:text-white">Privacy</Link>
                    <span aria-hidden="true">·</span>
                    <span>Independent of local government</span>
                </motion.footer>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#030014] to-transparent" />
        </div>
    );
}
