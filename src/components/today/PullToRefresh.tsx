"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { haptic } from "@/lib/haptics";

const PULL_THRESHOLD = 70;   // px before we trigger refresh
const MAX_PULL = 110;        // px cap on visual stretch

/**
 * Native-feeling pull-to-refresh for the Today screen.
 * Only triggers when scrollY === 0 and the user starts pulling down from the top.
 * Refresh action = `router.refresh()` which re-fetches server components.
 *
 * Touch-only (no mouse). Honors `prefers-reduced-motion`.
 */
export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Rubber band — decay past threshold so it feels resistive
      const decayed = Math.min(MAX_PULL, dy * 0.55);
      setPull(decayed);
      if (decayed >= PULL_THRESHOLD && !triggered.current) {
        triggered.current = true;
        haptic("medium");
      }
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      const fired = pull >= PULL_THRESHOLD;
      startY.current = null;
      if (fired) {
        setRefreshing(true);
        haptic("success");
        // Soft in-place refresh: router.refresh() re-runs the server
        // components and revalidates, so the pulse/weather update without a
        // full white document reload (a full reload is the most website-like
        // moment in the daily loop). Keep the spinner up briefly so the
        // gesture reads as deliberate, then settle.
        router.refresh();
        await new Promise((r) => setTimeout(r, 650));
        setRefreshing(false);
        setPull(0);
        triggered.current = false;
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pull, router]);

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const showSpinner = refreshing || pull > 0;

  return (
    <div
      aria-hidden={!showSpinner}
      className="pointer-events-none fixed left-0 right-0 z-[var(--z-prompt)] flex justify-center"
      style={{
        top: "calc(56px + env(safe-area-inset-top, 0px))",
        height: 0,
      }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-2)]"
        style={{
          borderColor: "var(--app-border)",
          transform: `translateY(${Math.min(pull * 0.6, 60)}px) scale(${0.6 + progress * 0.4})`,
          opacity: showSpinner ? 1 : 0,
          transition: refreshing ? "none" : pull === 0 ? "transform 200ms ease, opacity 200ms ease" : "none",
        }}
      >
        <Loader2
          className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          style={{
            color: progress >= 1 || refreshing ? "var(--app-brand)" : "var(--app-ink-3)",
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            transition: "color 200ms ease",
          }}
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </div>
  );
}
