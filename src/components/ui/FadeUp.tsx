/**
 * Subtle fade-up wrapper. CSS-only via @starting-style — no JS state.
 * Content is always visible (opacity:1) by default; the animation runs
 * only on first render in browsers that support @starting-style.
 * Graceful fallback in older browsers: no animation, content visible.
 */
export default function FadeUp({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`fade-up ${className}`}>{children}</div>;
}
