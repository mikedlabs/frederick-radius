"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Floating "Plan my evening" CTA — bottom-right, mobile only.
 * Hides when scrolling up (let the user breathe), reveals when scrolling down past 240px.
 * Hidden on /plan itself.
 */
export default function FloatingPlanFab() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const goingDown = y > lastY;
        if (y > 240 && goingDown) setVisible(true);
        else if (y < 120 || !goingDown) setVisible(false);
        lastY = y;
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (pathname === "/plan" || pathname.startsWith("/plan/")) return null;

  return (
    <Link
      href="/plan"
      aria-label="Plan my evening"
      onClick={() => {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(10);
        }
      }}
      className={`fab-breath fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[var(--app-shadow-3)] sm:hidden ${
        visible ? "opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 translate-y-3 scale-95"
      }`}
      style={{
        background: "var(--app-brand)",
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        transition: "opacity 240ms var(--app-ease-out), transform 240ms var(--app-ease-out)",
      }}
    >
      <Sparkles className="h-6 w-6" strokeWidth={2} aria-hidden />
    </Link>
  );
}
