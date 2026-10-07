"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [refreshRequested, setRefreshRequested] = useState(false);
  const refreshing = refreshRequested && isPending;
  const requestInFlight = useRef(false);
  const pendingRef = useRef(isPending);
  useEffect(() => { pendingRef.current = isPending; }, [isPending]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduceMotionRef.current = media.matches;
      setReduceMotion(media.matches);
    };
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!refreshRequested || isPending || pathname !== "/today" || document.visibilityState === "hidden") return;
    // App Router refresh may return the same server-cached data. Release the
    // gesture guard when its transition settles; the request acknowledgement
    // already shown cannot certify publisher freshness.
    requestInFlight.current = false;
  }, [refreshRequested, isPending, pathname]);

  useEffect(() => {
    const clearGesture = () => {
      startY.current = null;
      triggered.current = false;
      pullRef.current = 0;
      setPull(0);
    };
    const clearFeedback = () => {
      clearGesture();
      requestInFlight.current = false;
      setRefreshRequested(false);
      setAnnouncement("");
    };
    // The persistent layout must not carry a gesture or completion into
    // another page, or dispatch hidden work when a tab resumes.
    if (pathname !== "/today") {
      clearFeedback();
      return;
    }
    const onTouchStart = (e: TouchEvent) => {
      clearGesture();
      if (document.visibilityState === "hidden" || requestInFlight.current || pendingRef.current
        || window.scrollY > 0 || e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, button, [role='dialog'], [data-pull-refresh-ignore]")) return;
      startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (document.visibilityState === "hidden" || window.scrollY > 0 || e.touches.length !== 1) {
        clearGesture();
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      const decayed = Math.max(0, Math.min(MAX_PULL, dy * 0.55));
      pullRef.current = decayed;
      if (!reduceMotionRef.current) setPull(decayed);
      if (decayed >= PULL_THRESHOLD && !triggered.current) {
        triggered.current = true;
        haptic("medium");
      }
    };
    const onTouchEnd = () => {
      if (startY.current === null) return;
      const fired = pullRef.current >= PULL_THRESHOLD;
      clearGesture();
      if (!fired || document.visibilityState === "hidden" || requestInFlight.current || pendingRef.current) return;
      requestInFlight.current = true;
      setRefreshRequested(true);
      setAnnouncement("Refresh requested. Source checks may still be pending.");
      const failedRequest = () => {
        requestInFlight.current = false;
        setRefreshRequested(false);
        setAnnouncement("Refresh could not be requested. Please try again.");
      };
      try {
        startTransition(() => {
          try { router.refresh(); } catch { failedRequest(); }
        });
      } catch {
        failedRequest();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearFeedback();
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", clearGesture, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearFeedback();
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", clearGesture);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, router, startTransition]);

  if (pathname !== "/today") return null;

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const showSpinner = refreshing || (!reduceMotion && pull > 0);

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div
        data-pull-refresh-indicator
        data-refresh-pending={refreshing ? "true" : "false"}
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
            transform: reduceMotion || refreshing
              ? "translateY(12px) scale(1)"
              : `translateY(${Math.min(pull * 0.6, 60)}px) scale(${0.6 + progress * 0.4})`,
            opacity: showSpinner ? 1 : 0,
            transition:
              reduceMotion || refreshing
                ? "none"
                : pull === 0
                  ? "transform 200ms ease, opacity 200ms ease"
                  : "none",
          }}
        >
          <Loader2
            className={`h-4 w-4 ${refreshing && !reduceMotion ? "animate-spin" : ""}`}
            style={{
              color: progress >= 1 || refreshing ? "var(--app-brand)" : "var(--app-ink-3)",
              transform:
                refreshing || reduceMotion ? undefined : `rotate(${progress * 270}deg)`,
              transition: reduceMotion ? "none" : "color 200ms ease",
            }}
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </div>
    </>
  );
}
