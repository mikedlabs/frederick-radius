"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";

// Bumped to v10 so the sharper first-run orientation line shows once even
// for people who dismissed the older welcome strip (fresh copy, fresh key).
const STORAGE_KEY = "fr:beta-intro-dismissed:v10";

/**
 * BetaIntroCard — a SLIM first-visit welcome strip.
 *
 * Replaces the old full-screen founder essay that greeted every new
 * visitor with three paragraphs before the app did anything useful
 * (the #1 ship-blocker in both the journey audit and the external
 * product audit: "the user asked what's open and the app answered with
 * a modal essay"). Now the app opens STRAIGHT to the working front door
 * (weather → best move → tonight/near you); this is a single quiet,
 * dismissible line that points newcomers to the founder story on /about
 * instead of forcing it. Shows once, then never again (localStorage).
 */
export default function BetaIntroCard() {
  // `shown` flips true after mount ONLY if the dismiss key is unset.
  // SSR + first client paint render nothing (no flash / no hydration
  // mismatch); the localStorage read happens post-mount.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      dismissed = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
    if (!dismissed) setShown(true);
  }, []);

  if (!shown) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
    setShown(false);
  };

  return (
    <section
      aria-label="Welcome to Frederick Radius"
      className="breathe-in flex items-center gap-3 rounded-[var(--app-radius-lg)] px-3.5 py-2.5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--app-brand) 12%, var(--app-bg-elevated)), var(--app-bg-elevated))",
        border: "1px solid var(--app-border)",
      }}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold"
        style={{ background: "var(--app-brand)", color: "#fff" }}
      >
        ◎
      </span>
      <Link href="/about" onClick={dismiss} className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          New here? What&rsquo;s open, what&rsquo;s on, and what&rsquo;s worth your time around here.
        </span>
        <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: "var(--app-brand-press)" }}>
          How it works
          <ArrowRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90"
        style={{ color: "var(--app-ink-3)" }}
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
    </section>
  );
}
