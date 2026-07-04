/**
 * Route transition for the whole app.
 *
 * template.tsx (unlike layout.tsx) re-mounts on every navigation, so a fresh
 * wrapper here gives every page a considered entrance instead of a hard cut,
 * the small "this feels like a native app" tell.
 *
 * This used to import framer-motion, which forced the animation runtime into
 * the shared client bundle for EVERY app route, including otherwise server-only
 * static pages (/about, /terms, ...) where it was the dominant JS cost (audit
 * 2026-07). It is now a zero-JS SERVER component: the crossfade is a pure CSS
 * animation (.route-fade in globals.css), opacity-only so it never establishes
 * a stacking context that would break sticky filter bars or map controls, and
 * it self-disables under prefers-reduced-motion.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
