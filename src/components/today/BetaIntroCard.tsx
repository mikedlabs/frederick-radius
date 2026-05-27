"use client";

import { useEffect, useState } from "react";
import { X, ArrowRight, MessageSquare } from "lucide-react";

/**
 * BetaIntroCard — the first-visit "what is this and where it's going"
 * card that sits above SkyHero on /now until the user dismisses it.
 *
 * The framing turns "early and unfinished" into "shape this with me"
 * — sets expectations, names the trajectory, asks for the feedback
 * that actually changes what gets built next. Designed to be the
 * first thing a friend-of-a-friend sees when this gets shared, so
 * the right people land oriented instead of confused.
 *
 * Behavior:
 *   - Default hidden until mount (avoids SSR hydration flash).
 *   - On mount, reads localStorage. Shows ONLY when the dismiss key
 *     hasn't been set.
 *   - "Got it" dismisses + persists. "Send feedback" opens a mailto.
 *   - Version-keyed (`v1`) so a future revision of the message can
 *     re-show the card to everyone.
 *
 * Copy intentionally short. The longer the card, the lower the read
 * rate. The honest sentence is "this is early, your feedback shapes
 * what gets built next" — everything else exists to earn the right
 * to say that.
 */

// Bump the version suffix any time the message copy meaningfully changes,
// so a previously-dismissed user sees the updated welcome on next visit.
//   v1 — initial launch (food trucks, business profiles, more event feeds)
//   v2 — added "refined map with details other maps don't show" bullet
const KEY = "fr:beta-intro-dismissed:v2";
const FEEDBACK_EMAIL = "miked@madproductions.io";
const FEEDBACK_SUBJECT = "Frederick Radius feedback";

export default function BetaIntroCard() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(KEY) === "true";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate dismiss state after mount; localStorage isn't readable during SSR
      if (!dismissed) setShow(true);
    } catch {
      // localStorage unavailable; default to showing (a single
      // missed dismiss across a session is fine).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback when localStorage isn't readable
      setShow(true);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag for the SSR hydration guard
    setMounted(true);
  }, []);

  if (!mounted || !show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, "true");
    } catch {
      // ignore
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
    <article
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-5 shadow-[var(--app-shadow-2)]"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Welcome to Frederick Radius beta"
    >
      {/* Quiet brand wash so the card reads as the welcome moment,
          not yet another stat tile. Subtle gradient from brick
          (top-left) into the page bg. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 100% at 0% 0%, color-mix(in srgb, var(--app-brand) 14%, transparent), transparent 60%)",
        }}
      />

      {/* Top-right dismiss × — small, low-contrast, always available
          so a user who's read it once can close at any moment. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss intro"
        className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full transition hover:bg-[var(--app-bg-sunken)]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      <div className="relative space-y-3">
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

        <h2
          className="font-serif text-[22px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)", textWrap: "balance" } as React.CSSProperties}
        >
          One place for what&apos;s happening in Frederick County. For locals and visitors.
        </h2>

        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)", textWrap: "pretty" } as React.CSSProperties}
        >
          Today it pulls live data from the National Weather Service, the
          county and city governments, downtown Frederick, Hood College,
          Celebrate Frederick, and a few other sources, and stitches it
          into one daily briefing. There are 1,300+ places mapped across
          the 12 municipalities.
        </p>

        <div className="space-y-1.5 rounded-[var(--app-radius-md)] border-l-2 pl-3"
             style={{ borderColor: "var(--app-brand)" }}>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Coming next
          </p>
          <ul
            className="space-y-1 text-[13.5px] leading-snug"
            style={{ color: "var(--app-ink-2)" }}
          >
            <li>
              <span style={{ color: "var(--app-ink)" }}>A refined map with the details other
              maps don&apos;t show.</span> Food truck beacons when they&apos;re parked, trash cans,
              restrooms, free WiFi, EV charging, mailboxes, FedEx and UPS drop-offs, and more.
            </li>
            <li>
              <span style={{ color: "var(--app-ink)" }}>Deeper business profiles</span> so owners
              can talk to their customers directly, not through someone else&apos;s algorithm.
            </li>
            <li>
              <span style={{ color: "var(--app-ink)" }}>More live event feeds</span> from
              Weinberg, Delaplaine, local athletics, and the libraries.
            </li>
          </ul>
        </div>

        <p
          className="text-[13.5px] leading-snug"
          style={{ color: "var(--app-ink-2)", textWrap: "balance" } as React.CSSProperties}
        >
          This is early. The more feedback the community sends, the better this gets. If something
          feels off, if a place is missing, or if you have an idea, send it.
        </p>

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
            Got it, hide
          </button>
        </div>

        <p
          className="pt-1 text-[11px] italic"
          style={{ color: "var(--app-ink-3)" }}
        >
          Made by Michael DeMattia, a downtown Frederick resident.
        </p>
      </div>
    </article>
  );
}
