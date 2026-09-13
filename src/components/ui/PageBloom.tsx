"use client";

import type { CSSProperties } from "react";
import RippleMark from "@/components/brand/RippleMark";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * PageBloom keeps the field-guide paper treatment available for rare moments,
 * but it is deliberately quiet by default. An oversized Ripple is a
 * registration mark for a hero, onboarding, or editorial feature, not a
 * watermark behind every ordinary tool page.
 */
export default function PageBloom({
  variant = "warm-cool",
  motif = false,
  className = "",
  style,
}: {
  variant?: "warm-cool" | "warm" | "cool" | "single";
  /** Opt in only when the page genuinely needs an editorial brand moment. */
  motif?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tone =
    variant === "cool"
      ? "var(--app-cool)"
      : variant === "single"
        ? "var(--section-accent, var(--app-brand))"
        : variant === "warm"
          ? "var(--app-brand)"
          : "var(--app-ink-2)";

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
      style={style}
    >
      <div
        className="absolute inset-x-0 top-0 h-56"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--app-bg-elevated-solid) 42%, transparent), transparent)",
        }}
      />
      {motif && (
        <>
          <motion.div
            className="absolute -right-24 -top-32"
            style={{ color: tone }}
            initial={{ opacity: 0.055, scale: 1 }}
            animate={mounted ? { opacity: [0.04, 0.07, 0.04], scale: [0.98, 1.02, 0.98] } : {}}
            transition={{ duration: 12, ease: "easeInOut", repeat: Infinity }}
          >
            <RippleMark size={330} detail="full" />
          </motion.div>
          {/* Dynamic glowing ambient bloom */}
          <motion.div
            className="absolute left-[-10vw] top-[-5vh] h-[50vh] w-[50vh] rounded-full blur-[100px] opacity-40 mix-blend-plus-lighter"
            style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)` }}
            initial={{ x: 0, y: 0, scale: 1 }}
            animate={mounted ? {
              x: [0, 50, -20, 0],
              y: [0, -30, 20, 0],
              scale: [1, 1.1, 0.9, 1],
            } : {}}
            transition={{
              duration: 25,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
          <motion.div
            className="absolute right-[-10vw] top-[10vh] h-[40vh] w-[40vh] rounded-full blur-[120px] opacity-30 mix-blend-plus-lighter"
            style={{ background: `color-mix(in srgb, var(--app-brand) 12%, transparent)` }}
            initial={{ x: 0, y: 0, scale: 1 }}
            animate={mounted ? {
              x: [0, -40, 30, 0],
              y: [0, 40, -10, 0],
              scale: [1, 1.2, 0.8, 1],
            } : {}}
            transition={{
              duration: 18,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
          <div className="aurora-grain" />
        </>
      )}
    </div>
  );
}
