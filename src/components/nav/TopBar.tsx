"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Settings as SettingsIcon, MoreHorizontal, ChevronLeft } from "lucide-react";
import LocationChip from "./LocationChip";
import MoreSheet from "./MoreSheet";
import PulseIndicator from "./PulseIndicator";
import TopBarOmnibox from "./TopBarOmnibox";
import { usePathname, useRouter } from "next/navigation";
import { tabIndexForPath } from "./tabs";

/**
 * Auto-hide on scroll: the bar slides up out of view when the user
 * scrolls down past a threshold and slides back in the instant they
 * scroll up — the iOS / Mobile-Safari standard. Hides ~56px of chrome
 * while reading and lets the user reclaim it with a small upward swipe.
 * Always pinned at the top of the document (no flicker at top of page)
 * and during a search overlay.
 */
function useHideOnScroll(disabled: boolean) {
  // Track only what scroll position says; the disabled override is
  // applied at render time below so we don't cascade a setState from
  // an effect when `disabled` flips (search overlay open / close).
  const [scrollHidden, setScrollHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (y < 80) setScrollHidden(false);
        else if (dy > 6) setScrollHidden(true);
        else if (dy < -4) setScrollHidden(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return disabled ? false : scrollHidden;
}

export default function TopBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useHideOnScroll(false);

  // Deep page = anything that isn't one of the 4 bottom-nav tabs (or its
  // sub-route) and isn't the root. On these the bottom nav lights NO
  // tab, so without a back control the user is stranded — the #1 cause
  // of the "I tapped something and got dumped with no way back" feel.
  // The left slot becomes a Back button here instead of the wordmark.
  const isDeepPage = pathname !== "/" && tabIndexForPath(pathname) === -1;
  const goBack = () => {
    // Prefer real history; fall back to /guide when the user landed
    // here cold (deep link / new tab) so Back is never a dead button.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/guide");
    }
  };

  // Close the More sheet on route change — the drawer would otherwise
  // cover the new page after the user tapped one of its items.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: dismiss the drawer when the user navigates away
    setMoreOpen(false);
  }, [pathname]);

  // Cmd-K / Ctrl-K opens search globally
  useEffect(() => {
    // ⌘K / Ctrl-K and "/" focus THE omnibox — the app's single search
    // input — preserving the muscle memory the old modal trained.
    const focusOmnibox = () => {
      const el = document.querySelector<HTMLInputElement>(
        'header input[type="search"]',
      );
      el?.focus();
      el?.select();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        focusOmnibox();
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        focusOmnibox();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        className="sticky top-0 border-b border-[var(--app-border)] bg-[var(--app-bg)]/90 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
        style={{
          // Tokenized z-index — see globals.css :root --z-* scale.
          zIndex: "var(--z-sticky)",
          transform: hidden ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 240ms var(--app-ease-out)",
          willChange: "transform",
        }}
      >
        <div
          className="mx-auto flex h-14 max-w-screen-md items-center gap-2"
          // Horizontal padding is max(1rem base, side-inset): a notched
          // phone in landscape puts the notch on a side edge, which could
          // clip the search field / back button. max() keeps the 1rem base
          // on every non-notched device and in portrait (side insets 0).
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          }}
        >
          {isDeepPage ? (
            // Deep page: a clear way back, so no screen is a dead-end.
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="-ml-1.5 inline-flex h-10 items-center gap-1 rounded-full pl-1 pr-2.5 font-semibold tracking-tight transition active:scale-[0.96]"
              style={{ color: "var(--app-ink)" }}
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              <span className="text-[15px]">Back</span>
            </button>
          ) : (
            <Link
              href="/"
              aria-label="Frederick Radius — home"
              className="tap-44 flex items-center gap-2 font-serif text-[16px] font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-[var(--app-shadow-1)]"
                style={{ background: "var(--app-brand)" }}
                aria-hidden
              >
                <Disc />
              </span>
              {/* Wordmark hides on the narrowest phones so the search
                  pill gets real room (it was clipping to "Se…"); the
                  disc mark alone carries the brand there. Full lockup
                  returns from sm: up. */}
              <span className="hidden leading-tight sm:block">
                Frederick
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em] -mt-0.5" style={{ color: "var(--app-ink-3)" }}>
                  Radius
                </span>
              </span>
            </Link>
          )}

          {/* THE omnibox — the one search input in the entire application
              (redesign shell). A real input, not a modal trigger: type
              "coffee open now", the intent becomes a removable chip and
              the URL carries the state. */}
          <div className="ml-1 min-w-0 flex-1">
            <TopBarOmnibox />
          </div>

          {/* (Removed the header "My Radius" bookmark — it duplicated the
              My Radius primary nav tab/SideRail item, putting two bookmark
              icons on screen for one destination. My Radius stays one tap
              away via the bottom nav (<lg) and the SideRail (≥lg).) */}

          {/* Saved — promoted to the TopBar now that the primary nav is
              three surfaces (redesign shell): one tap from anywhere,
              beside Settings. */}
          <Link
            href="/my-radius"
            aria-label="Saved"
            className="tap-44 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            <Bookmark className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>

          {/* Settings — visible at all viewports. The original
              design hid this on mobile and routed mobile users via
              the /saved page (which has its own Settings link), but
              that's a non-obvious two-tap path no real user will
              discover. Settings is the only surface that lets you
              change persona, home muni, interests, and notifications,
              so it has to be one tap from anywhere. LocationChip
              stays mobile-hidden because the search modal carries
              the same affordance. */}
          {/* Live county pulse indicator — lights up when there's
              an active NWS alert, school alert, traffic incident, or
              significant power outage. Quiet by default so it never
              competes with the rest of the header chrome. */}
          <PulseIndicator />

          {/* Trailing actions are calm GLYPHS, not bordered pills — the
              search pill is the one bordered "find" affordance, so the
              header reads as one primary + two quiet icons (the Tiimo /
              calm-chrome move) instead of three chips competing. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-[var(--app-bg-sunken)] active:scale-95"
            style={{ color: "var(--app-ink-3)" }}
          >
            <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </Link>

          {/* "More" trigger — opens the Field Guide drawer (books,
              History, Collections, Tools, Useful, App items). The
              drawer USED to be a 5th bottom-nav tab; in the May 2026
              IA cleanup it moved here. Smaller footprint, same
              destinations reachable. The 4-tab BottomNav / SideRail
              now own only the primary surfaces (Today / Map / Events
              / My Radius). */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label="More"
            title="More"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-[var(--app-bg-sunken)] active:scale-95"
            style={{ color: "var(--app-ink-3)" }}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>

          {/* LocationChip is hidden on the narrowest phones where the
              search bar needs the room; surfaces from sm: up. The user
              can still see/set location inside the search modal. */}
          <div className="hidden sm:block">
            <LocationChip />
          </div>
        </div>
      </header>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

function Disc() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="white" />
    </svg>
  );
}
