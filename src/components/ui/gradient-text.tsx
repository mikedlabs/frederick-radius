"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";

interface GradientTextProps {
    children: React.ReactNode;
    className?: string;
    animate?: boolean;
}

export function GradientText({ children, className, animate = true }: GradientTextProps) {
    const reduce = useReducedMotion();
    const on = animate && !reduce;
    return (
        <motion.span
            initial={on ? { opacity: 0, y: 20 } : {}}
            animate={on ? { opacity: 1, y: 0 } : {}}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
            className={cn(
                "bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent font-bold",
                className
            )}
        >
            {children}
        </motion.span>
    );
}
