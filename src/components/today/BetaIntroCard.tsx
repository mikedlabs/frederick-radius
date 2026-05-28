"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageSquare } from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/**
 * BetaIntroCard — first-visit welcome.
 *
 * v3 (May 2026): converted from an inline /now card to a true
 * first-visit POPUP via BottomDrawer. The drawer slides in on the
 * first visit (no localStorage key yet) and never opens again once
 * dismissed. On desktop Vaul centers the sheet; on mobile it
 * bottom-sheets — same component, viewport-appropriate.
 *
 * Why a popup over an inline card: the welcome explains what the
 * product IS. Sliding past it on first paint defeats the purpose;
 * an overlay forces a moment of orientation, then gets out of the
 * way forever.
 *
 * Copy is plain. The job here is honesty, not a marketing pitch:
 * say what this is, why it exists, that it's early, and how to
 * push back.
 *
 * Version-keyed (`v4`) so a future copy revision re-shows the
 * popup to everyone.
 */

const KEY = "fr:beta-intro-dismissed:v4";
const FEEDBACK_EMAIL = "miked@madproductions.io";
const FEEDBACK_SUBJECT = "Frederick Radius feedback";

export default function BetaIntroCard() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(KEY) === "true";
      if (!dismissed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate dismiss state after mount; localStorage isn't readable during SSR
        setOpen(true);
      }
    } catch {
      // localStorage unavailable — open as a one-time fallback so
      // the user at least sees the intro once.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback when localStorage isn't readable
      setOpen(true);
    }
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, "true");
    } catch {
      /* ignore */
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Treat any close (X / drag-down / backdrop tap) as a dismiss.
      try {
        window.localStorage.setItem(KEY, "true");
      } catch {
        /* ignore */
      }
    }
  };

  const mailto =
    `mailto:${FEEDBACK_EMAIL}` +
    `?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}` +
    `&body=${encodeURIComponent(
      "What I love:\n\nWhat felt confusing or broken:\n\nWhat I wish existed:\n\n\n— sent from " +
        (typeof window !== "undefined" ? window.location.href : "frederickradius.app"),
    )}`;

  return (
    <BottomDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title="Welcome to Frederick Radius"
      subtitle="Beta · May 2026"
    >
      <div className="space-y-4 px-5 py-4">
        {/* Eyebrow — brand-color tag echoes the drawer subtitle so a
            user who skips the header still anchors on the beta call. */}
        <p
          className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-brand)" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
          Beta · May 2026
        </p>

        <div
          className="space-y-3 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          <p
            className="font-serif text-[18px] font-semibold leading-snug"
            style={{ color: "var(--app-ink)" }}
          >
            Frederick Radius is the start of a dedicated home base for Frederick County.
          </p>

          <p>
            Local information is everywhere right now: city pages, county pages,
            business websites, Facebook, Instagram, Reddit, event calendars, and
            posts people only see if the algorithm happens to show them.
          </p>

          <p>
            This is an attempt to bring the city, the county&rsquo;s 12 municipalities,
            local businesses, events, services, and everyday updates into one
            clearer place.
          </p>

          <p>
            It is still early, and it will keep changing. That is why feedback
            matters now.
          </p>

          <p>
            If something feels off, if a place is missing, or if you have an
            idea, send it over.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={mailto}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.98]"
            style={{
              background: "var(--app-brand)",
              color: "white",
              boxShadow: "var(--app-brand-glow)",
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Send feedback
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.98]"
            style={{
              background: "transparent",
              color: "var(--app-ink-3)",
              border: "1px solid var(--app-border)",
            }}
          >
            Got it
          </button>
        </div>

        <p
          className="pt-1 text-[12px] italic"
          style={{ color: "var(--app-ink-3)" }}
        >
          Made by Michael DeMattia, a downtown Frederick resident.
        </p>
      </div>
    </BottomDrawer>
  );
}
