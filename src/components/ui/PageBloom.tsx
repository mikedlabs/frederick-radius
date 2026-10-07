"use client";

import { useContext, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import RippleMark from "@/components/brand/RippleMark";
import { motion, MotionConfigContext, type HTMLMotionProps } from "framer-motion";
type AmbientLayerProps = Omit<HTMLMotionProps<"div">, "style" | "children"> & {
  active: boolean;
  style?: CSSProperties;
  children?: ReactNode;
  "data-ambient-layer": string;
};

function AmbientLayer({ active, children, className, style,
  "data-ambient-layer": layer, ...motionProps }: AmbientLayerProps) {
  // A scalar target equal to the initial frame can leave a prior loop
  // running. Unmount its motion owner so Framer stops the owned values, while
  // an ordinary element preserves the same static color wash.
  if (active) return <motion.div {...motionProps} className={className} style={style}
    data-ambient-layer={layer}>{children}</motion.div>;
  return <div className={className} style={style} data-ambient-layer={layer}>{children}</div>;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeAmbientMotion(onChange: () => void) {
  const preference = window.matchMedia(REDUCED_MOTION_QUERY);
  document.addEventListener("visibilitychange", onChange);
  preference.addEventListener("change", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    preference.removeEventListener("change", onChange);
  };
}

function readAmbientMotion() {
  return document.visibilityState === "visible"
    && !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// Keep SSR and the first hydration frame static until the browser can confirm
// both visibility and the visitor's current motion preference.
function readServerAmbientMotion() { return false; }

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
  /** Opt in only when the page genuinely needs an editorial brand moment (RippleMark watermark). */
  motif?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { reducedMotion } = useContext(MotionConfigContext);
  const browserAllowsMotion = useSyncExternalStore(
    subscribeAmbientMotion,
    readAmbientMotion,
    readServerAmbientMotion,
  );
  // A parent can request less motion, but cannot override the visitor's
  // operating-system preference or run animation while the tab is hidden.
  const active = browserAllowsMotion && reducedMotion !== "always";

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
      data-page-bloom
      data-ambient-motion={active ? "active" : "static"}
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
        <AmbientLayer active={active}
          data-ambient-layer="motif"
          className="absolute -right-24 -top-32"
          style={{ color: tone, opacity: 0.055 }}
          initial={{ opacity: 0.055, scale: 1 }}
          animate={active ? { opacity: [0.04, 0.07, 0.04], scale: [0.98, 1.02, 0.98] } : { opacity: 0.055, scale: 1 }}
          transition={active ? { duration: 12, ease: "easeInOut", repeat: Infinity } : { duration: 0, repeat: 0 }}
        >
          <RippleMark size={330} detail="full" />
        </AmbientLayer>
      )}

      {/* Preserve the color wash while motion is reduced or the tab is hidden. */}
      <AmbientLayer active={active}
        data-ambient-layer="warm"
        className="absolute left-[-10vw] top-[-5vh] h-[50vh] w-[50vh] rounded-full blur-[100px] opacity-40 mix-blend-plus-lighter"
        style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)` }}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={active ? {
          x: [0, 50, -20, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.1, 0.9, 1],
        } : { x: 0, y: 0, scale: 1 }}
        transition={active ? {
          duration: 25,
          ease: "easeInOut",
          repeat: Infinity,
        } : { duration: 0, repeat: 0 }}
      />
      <AmbientLayer active={active}
        data-ambient-layer="cool"
        className="absolute right-[-10vw] top-[10vh] h-[40vh] w-[40vh] rounded-full blur-[120px] opacity-30 mix-blend-plus-lighter"
        style={{ background: `color-mix(in srgb, var(--app-brand) 12%, transparent)` }}
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={active ? {
          x: [0, -40, 30, 0],
          y: [0, 40, -10, 0],
          scale: [1, 1.2, 0.8, 1],
        } : { x: 0, y: 0, scale: 1 }}
        transition={active ? {
          duration: 18,
          ease: "easeInOut",
          repeat: Infinity,
        } : { duration: 0, repeat: 0 }}
      />
      
      {/* Global paper grain effect */}
      <div className="aurora-grain" />
    </div>
  );
}
