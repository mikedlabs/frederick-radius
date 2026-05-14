"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GradientTextProps {
    children: React.ReactNode;
    className?: string;
    animate?: boolean;
}

export function GradientText({ children, className, animate = true }: GradientTextProps) {
    return (
        <motion.span
            initial={animate ? { opacity: 0, y: 20 } : {}}
            animate={animate ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
                "bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent font-bold",
                className
            )}
        >
            {children}
        </motion.span>
    );
}
