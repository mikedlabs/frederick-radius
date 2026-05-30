"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Route transition for the whole app.
 *
 * template.tsx (unlike layout.tsx) re-mounts on every navigation, so a
 * motion wrapper here gives every page a considered entrance instead of
 * a hard cut — the small "this feels like a native app" tell.
 *
 * Deliberately OPACITY-ONLY: a transform (translate/scale) on a wrapper
 * that stays in the tree would establish a containing block and a
 * stacking context that breaks `position: sticky` filter bars and the
 * map's controls. A cross-fade is safe everywhere, plays nicely on top
 * of the pages' own `.reveal-up` / `stagger-children` micro-animations,
 * and never fights full-bleed breakouts.
 *
 * Honors prefers-reduced-motion: those users get the content with no
 * fade at all.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
