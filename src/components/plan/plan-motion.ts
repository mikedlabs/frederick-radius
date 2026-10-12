"use client";

import { flushSync } from "react-dom";

/** Keep the build pending until its state update commits. Animation completion
 * is optional and must not delay the usable plan. */
export function revealPlan(update: () => void): Promise<void> {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const completion = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    try {
      update();
      resolve();
    } catch (error) {
      reject(error);
    }
  };

  let canAnimate = false;
  try {
    canAnimate = typeof document !== "undefined" && typeof window !== "undefined"
      && typeof document.startViewTransition === "function"
      && typeof window.matchMedia === "function"
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { /* An unavailable preference check uses the immediate path. */ }
  if (!canAnimate) {
    commit();
    return completion;
  }

  try {
    const transition = document.startViewTransition(() => {
      if (!committed) flushSync(commit);
    });
    // A skipped animation may reject after a successful state update. A failed
    // capture before the callback falls back once and ignores any late callback.
    void transition.ready.catch(() => {});
    void transition.finished.catch(commit);
    void transition.updateCallbackDone.then(commit, commit);
  } catch {
    commit();
  }
  return completion;
}
