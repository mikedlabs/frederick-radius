"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    hoverEffect?: boolean;
}

export function GlassCard({ children, className, hoverEffect = true }: GlassCardProps) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={reduce || !hoverEffect ? undefined : { scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
            className={cn(
                "relative overflow-hidden rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-xl shadow-xl",
                "before:absolute before:inset-0 before:bg-gradient-to-br before:from-glass-highlight before:to-transparent before:opacity-20",
                className
            )}
        >
            <div className="relative z-10">{children}</div>
        </motion.div>
    );
}
