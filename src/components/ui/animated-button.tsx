"use client";

import { cn } from "@/lib/utils";
import { HTMLMotionProps, motion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedButtonProps extends HTMLMotionProps<"button"> {
    children: ReactNode;
    variant?: "primary" | "secondary" | "outline";
}

export function AnimatedButton({ children, className, variant = "primary", ...props }: AnimatedButtonProps) {
    const variants = {
        primary: "bg-gradient-to-r from-primary to-secondary text-white border-transparent shadow-[0_0_20px_rgba(112,0,255,0.5)]",
        secondary: "bg-white/10 text-white border-white/10 hover:bg-white/20",
        outline: "bg-transparent border-white/20 text-white hover:border-white/50",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
                "relative px-8 py-4 rounded-full font-semibold tracking-wide border transition-all duration-300",
                "flex items-center justify-center gap-2 overflow-hidden",
                variants[variant],
                className
            )}
            {...props}
        >
            <span className="relative z-10 flex items-center gap-2">{children}</span>
            {variant === "primary" && (
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-secondary to-primary opacity-0 transition-opacity duration-300 hover:opacity-100"
                />
            )}
        </motion.button>
    );
}
