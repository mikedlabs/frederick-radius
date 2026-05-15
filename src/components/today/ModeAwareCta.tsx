"use client";

import Link from "next/link";
import { Sparkles, Map } from "lucide-react";
import { motion } from "framer-motion";
import { useMode } from "@/hooks/useMode";
import ModeToggle from "./ModeToggle";
import { haptic } from "@/lib/haptics";

/**
 * Hero CTA + mode toggle that responds to the active mode.
 * Resident → "Plan my evening" (brick red, sparkles)
 * Visitor  → "Plan my visit" (cool blue, map icon)
 */
export default function ModeAwareCta() {
  const { mode } = useMode();

  const isVisitor = mode === "visitor";
  const href = "/plan";
  const label = isVisitor ? "Plan my visit" : "Plan my evening";
  const Icon = isVisitor ? Map : Sparkles;
  const bg = isVisitor ? "var(--app-cool)" : "var(--app-brand)";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-5">
      <motion.span
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.015 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        className="inline-flex"
        onTapStart={() => haptic("light")}
      >
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--app-shadow-2)]"
          style={{ background: bg }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          {label}
        </Link>
      </motion.span>
      <ModeToggle />
    </div>
  );
}
