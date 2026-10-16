"use client";

import { flushSync } from "react-dom";

/** Commit the real plan before releasing Build. Photo and stop CSS animations
 * provide the reveal without a document snapshot that hides usable controls. */
export async function revealPlan(update: () => void): Promise<void> {
  flushSync(update);
}
