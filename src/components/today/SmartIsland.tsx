"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import AnimatedSkyGlyph, { SkyVariant } from "./AnimatedSkyGlyph";
import { ChevronRight } from "lucide-react";
import DaylightLeftInline from "@/components/today/DaylightLeftInline";

type SmartIslandProps = {
  headline: string;
  safetyNote: string | null;
  tempNow: number | null;
  variant: SkyVariant | null;
  stats: string[];
  verdictTone: "good" | "mixed" | "rough";
  airQualityIndex?: number | null;
};

function AqiGauge({ aqi }: { aqi: number }) {
  const position = Math.min(Math.max((aqi / 300) * 100, 0), 100);
  
  let label = "Good";
  if (aqi > 50) label = "Moderate";
  if (aqi > 100) label = "Unhealthy for Sensitive Groups";
  if (aqi > 150) label = "Unhealthy";
  if (aqi > 200) label = "Very Unhealthy";
  if (aqi > 300) label = "Hazardous";

  return (
    <div className="mt-3 rounded-[var(--app-radius-sm)] border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-inset)" }}>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-2)" }}>
        <span>Air Quality</span>
        <span style={{ color: "var(--app-ink)" }}>{aqi} {label}</span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500">
        <motion.div
          initial={{ left: 0 }}
          animate={{ left: `${position}%` }}
          transition={{ type: "spring", bounce: 0, duration: 1 }}
          className="absolute top-1/2 -ml-1.5 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow-sm"
        />
      </div>
    </div>
  );
}

export default function SmartIsland({
  headline,
  safetyNote,
  tempNow,
  variant,
  stats,
  verdictTone,
  airQualityIndex,
}: SmartIslandProps) {
  const [expanded, setExpanded] = useState(false);
  
  const ref = useRef<HTMLButtonElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 20 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"]);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };
  
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const glowColors = {
    good: "rgba(167, 139, 250, 0.4)",
    mixed: "rgba(148, 163, 184, 0.4)",
    rough: "rgba(248, 113, 113, 0.5)",
  };
  
  const borderColors = {
    good: "rgba(167, 139, 250, 0.6)",
    mixed: "rgba(148, 163, 184, 0.5)",
    rough: "rgba(248, 113, 113, 0.7)",
  };

  const currentGlow = glowColors[verdictTone] || glowColors.mixed;
  const currentBorder = borderColors[verdictTone] || borderColors.mixed;

  return (
    <motion.button
      ref={ref}
      layout
      onClick={(e) => {
        e.preventDefault();
        setExpanded(!expanded);
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative z-50 mx-auto w-full max-w-[360px] cursor-pointer overflow-hidden rounded-[32px] bg-[var(--app-bg-elevated-solid)] text-left shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
        boxShadow: `0 12px 40px -12px ${currentGlow}, inset 0 1px 1px rgba(255,255,255,0.1)`,
        border: `1px solid ${currentBorder}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
      initial={{ borderRadius: 32 }}
      animate={{ borderRadius: expanded ? 24 : 32 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
    >
      {/* Dynamic ambient highlight that tracks mouse position */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 opacity-40 mix-blend-overlay"
        style={{
          background: useTransform(
            [mouseXSpring, mouseYSpring],
            ([xPos, yPos]) => `radial-gradient(circle at ${(xPos as number + 0.5) * 100}% ${(yPos as number + 0.5) * 100}%, rgba(255,255,255,0.8) 0%, transparent 60%)`
          )
        }}
      />
      <motion.div layout className="relative z-10 flex flex-col px-4 py-3">
        <motion.div layout className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {variant && (
              <motion.div layout className="shrink-0 drop-shadow-md">
                <AnimatedSkyGlyph variant={variant} size={expanded ? 40 : 32} className="opacity-95" />
              </motion.div>
            )}
            
            {!expanded ? (
              <motion.div 
                layout 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="flex items-baseline gap-2 truncate"
              >
                {tempNow != null && (
                  <span className="font-serif text-[22px] font-medium leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
                    {tempNow}&deg;
                  </span>
                )}
                <span className="truncate text-[14px] font-medium" style={{ color: "var(--app-ink-2)" }}>
                  {headline}
                </span>
              </motion.div>
            ) : null}
          </div>
          
          <motion.div layout>
            <ChevronRight
              className="h-4 w-4 shrink-0 opacity-40 transition-transform"
              strokeWidth={2.5}
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="mt-3 flex flex-col gap-2"
            >
              {tempNow != null && (
                <div className="font-serif text-[44px] font-light leading-none tracking-tight tabular-nums" style={{ color: "var(--app-ink)" }}>
                  {tempNow}&deg;
                </div>
              )}
              
              <h2 className="font-serif text-[18px] font-semibold leading-snug tracking-tight [text-wrap:balance] sm:text-[20px]" style={{ color: "var(--app-ink)" }}>
                {headline}
              </h2>
              
              {safetyNote && (
                <p className="mt-1 text-[12.5px] font-medium text-red-500">
                  {safetyNote}
                </p>
              )}
              
              {stats.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] font-medium leading-snug tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                  {stats.join("  ·  ")}
                  <span className="ml-1">
                    <DaylightLeftInline />
                  </span>
                </div>
              )}

              {airQualityIndex != null && <AqiGauge aqi={airQualityIndex} />}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}
