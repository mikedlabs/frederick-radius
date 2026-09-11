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

const KEY = "fr:beta-intro-dismissed:v8";
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
      subtitle="Public Beta · September"
    >
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
              Public Beta
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
              We are officially in Public Beta! Thanks for being an early user.
            </p>

            <p>
              Frederick Radius is an evolving web app built to bring the county and the city together. 
              Since our early testing in May, we've added a ton of new features based on your feedback:
            </p>

            <ul className="list-disc pl-4 space-y-1">
              <li><strong>The Great Frederick Fair Hub:</strong> Schedules, headliners, and an interactive fairgrounds map.</li>
              <li><strong>Major Events Takeovers:</strong> Never miss tentpole events like <em>In the Streets</em> or <em>Color on the Creek</em>.</li>
              <li><strong>Live Events Integration:</strong> Ticketmaster, Bandsintown, and local venue calendars synced to the map.</li>
              <li><strong>Map Modes:</strong> Toggle between "Browse" (everything) and "Radius" (isochrone travel times).</li>
            </ul>

            <p>
              This is just the beginning. I would love to know what you think of the new features!
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
            <a
              href={mailto}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition active:scale-[0.98]"
              style={{
                background: "var(--app-brand)",
                color: "white",
                boxShadow: "var(--app-brand-glow)",
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Send feedback
            </a>
            
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium" style={{ background: "color-mix(in srgb, var(--app-ink) 4%, transparent)", color: "var(--app-ink-2)" }}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white shadow-sm border" style={{ borderColor: "var(--app-border)" }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              </span>
              <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for the app experience</span>
            </div>
          </div>

          <p
            className="pt-2 text-[12px] italic"
            style={{ color: "var(--app-ink-3)" }}
          >
            Made by Michael DeMattia, a downtown Frederick resident.
          </p>
        </div>
      </div>
    </BottomDrawer>
  );
}
