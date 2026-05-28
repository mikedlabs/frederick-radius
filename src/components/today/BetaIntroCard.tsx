"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessageSquare, Compass, X } from "lucide-react";
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

const KEY = "fr:beta-intro-dismissed:v7";
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
      {/* Close X — absolute, top-right of the drawer body. Replaces
          the old "Got it" outline button so the only secondary
          action is the X (Vaul's drag-down and backdrop tap still
          work). Same tap-target size as iOS sheet dismiss. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close welcome"
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full transition active:scale-[0.94]"
        style={{
          background: "color-mix(in srgb, var(--app-ink) 6%, transparent)",
          color: "var(--app-ink-2)",
        }}
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>

      <div className="relative overflow-hidden">
        {/* Decorative blooms — soft brand-color glow in two corners,
            behind everything. Adds depth + a "this place is ours"
            warmth without competing with the copy. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--app-brand) 35%, transparent) 0%, color-mix(in srgb, var(--app-brand) 0%, transparent) 70%)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--app-brand-2) 28%, transparent) 0%, color-mix(in srgb, var(--app-brand-2) 0%, transparent) 70%)",
          }}
        />

        <div className="relative space-y-4 px-5 py-5">
          {/* Compass crest + Beta pill — visual anchor that ties the
              card to the product's "compass for Frederick County"
              tagline. Brand-color tint, glass-pill backing. */}
          <div className="flex items-start justify-between gap-3">
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--app-brand) 28%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <Compass className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{
                background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                color: "var(--app-brand)",
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--app-brand)" }}
              />
              Beta · May 2026
            </p>
          </div>

          <div
            className="space-y-3 text-[14px] leading-relaxed"
            style={{ color: "var(--app-ink-2)" }}
          >
            <p
              className="font-serif text-[19px] font-semibold leading-snug tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              I have lived in Downtown Frederick for nearly 10 years,
              and I still find out about things after they happen.
            </p>

            <p>That is part of why I built Frederick Radius.</p>

            <p>
              Frederick County and the city are connected in real
              life, but the information around them is scattered
              across too many places. Events get buried. Business
              updates disappear. Local services are not always easy
              to find. Visitors ask the same questions. Residents
              do too.
            </p>

            <p>
              Frederick Radius is an early web app built to bring
              more of those pieces together for the county and the
              city.
            </p>

            <p>
              There is nothing to download. It works right in your
              browser.
            </p>

            <p>
              This is still beta, and it will keep changing. I would
              love to know what you think.
            </p>
          </div>

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

          <p
            className="pt-1 text-[12px] italic"
            style={{ color: "var(--app-ink-3)" }}
          >
            Made by Michael DeMattia, a downtown Frederick resident.
          </p>
        </div>
      </div>
    </BottomDrawer>
  );
}
