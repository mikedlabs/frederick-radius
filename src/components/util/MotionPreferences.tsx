"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * MotionPreferences carries the visitor's Reduce Motion setting into
 * framer-motion.
 *
 * globals.css already zeroes every CSS animation and transition under
 * `prefers-reduced-motion`, but that rule cannot reach framer-motion, whose
 * default is to ignore the setting. With `reducedMotion="user"` every motion
 * component under this boundary resolves transform and layout animation
 * instantly for those visitors, while opacity still fades. Components that
 * branch on `useReducedMotion()` themselves keep working. This is the net
 * under the ones that do not.
 *
 * It is its own file because the app layout is a server component and
 * MotionConfig needs a client boundary.
 */
export default function MotionPreferences({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
