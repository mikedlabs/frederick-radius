"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Music, CloudRain, AlertTriangle, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import LiveDot from "@/components/ui/LiveDot";
import { haptic } from "@/lib/haptics";
import type { Activity, ActivityIcon } from "@/lib/live-activity";

const ICON: Record<ActivityIcon, LucideIcon> = {
  music: Music,
  rain: CloudRain,
  alert: AlertTriangle,
  sparkles: Sparkles,
};

/**
 * A single activity tile that rotates through. Server hands us the data
 * up-front; client rotates and morphs between states using AnimatePresence.
 *
 * Priority order (highest first):
 *   1. Live event happening RIGHT NOW
 *   2. Weather warning (rain >50%, severe weather)
 *   3. Civic alert (311 spike, road closure)
 *   4. Next event starting within 2 hours
 *
 * Tap = navigate to the linked detail (event page, civic page, etc.)
 */
const ROTATE_MS = 5000;

export default function LiveActivityPill({ activities }: { activities: Activity[] }) {
  const [idx, setIdx] = useState(0);

  // Auto-rotate when there's more than one activity
  useEffect(() => {
    if (activities.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % activities.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [activities.length]);

  const current = activities[idx];
  if (!current) return null;

  const Icon = ICON[current.icon];

  return (
    <div className="flex justify-center">
      <Link
        href={current.href}
        onClick={() => haptic("light")}
        className="block w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.9, y: -6, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, y: 6, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative flex items-center gap-3 overflow-hidden rounded-full border bg-[var(--app-bedrock)] px-3 py-2 text-white shadow-[var(--app-shadow-3)] sm:px-4"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            {/* Soft accent glow on the left */}
            <div
              aria-hidden
              className="absolute -left-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full opacity-30 blur-2xl"
              style={{ background: current.accent }}
            />
            <span
              aria-hidden
              className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${current.accent}33`, color: current.accent }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: current.accent }}>
                {current.kind === "live-event" && <LiveDot />}
                {current.label}
              </p>
              <p className="truncate text-[13px] font-semibold leading-tight">
                {current.title}
              </p>
              {current.subtitle && (
                <p className="truncate text-[11px] opacity-70 leading-tight">{current.subtitle}</p>
              )}
            </div>
            {/* Dot indicator if more than one activity rotates */}
            {activities.length > 1 && (
              <div className="relative flex shrink-0 items-center gap-0.5">
                {activities.map((_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="block h-1 rounded-full transition-all"
                    style={{
                      width: i === idx ? 8 : 3,
                      background: i === idx ? current.accent : "rgba(255,255,255,0.25)",
                    }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Link>
    </div>
  );
}

// buildActivities() lives in @/lib/live-activity.ts (server-callable).
