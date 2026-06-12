"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Bookmark, Settings as SettingsIcon, MoreHorizontal } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import LocationChip from "./LocationChip";
import MoreSheet from "./MoreSheet";
import PulseIndicator from "./PulseIndicator";
import { usePathname } from "next/navigation";

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

/**
 * Rotating placeholder prompts inside the search pill. A static
 * "Search the county" reads as a generic input affordance; rotating
 * concrete questions advertises what the search actually knows — a
 * coffee shop open right now, tonight's live music, Carroll Creek,
 * a date-night plan. Apple Maps and Google's home-bar do the same
 * thing for the same reason: nothing else on a header tells a new
 * user the shape of what's inside.
 *
 * Order is deterministic; cycle is ~4s with a 220ms cross-fade so
 * the change is felt, not read mid-rotation. Stops while the search
 * overlay is open so the user isn't watching prompts swap behind
 * the modal.
 */
const SEARCH_PROMPTS = [
  "Coffee open right now",
  "Tonight's live music",
  "Carroll Creek",
  "Plan a date night",
  "Family-friendly weekend",
  "Hiking near downtown",
] as const;

function useRotatingPrompt(paused: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % SEARCH_PROMPTS.length);
    }, 4000);
    return () => window.clearInterval(t);
  }, [paused]);
  return SEARCH_PROMPTS[idx];
}

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const hidden = useHideOnScroll(searchOpen);
  const prompt = useRotatingPrompt(searchOpen);

  // Close the More sheet on route change — the drawer would otherwise
  // cover the new page after the user tapped one of its items.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: dismiss the drawer when the user navigates away
    setMoreOpen(false);
  }, [pathname]);

  // Cmd-K / Ctrl-K opens search globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      // Forward slash as a quick-open (don't trigger when typing into another input)
      if (e.key === "/" && !searchOpen) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && (e.target as HTMLElement)?.contentEditable !== "true") {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <>
      <header
        className="sticky top-0 border-b border-[var(--app-border)] bg-[var(--app-bg)]/85 backdrop-blur-md pt-[env(safe-area-inset-top)]"
        style={{
          // Tokenized z-index — see globals.css :root --z-* scale.
          zIndex: "var(--z-sticky)",
          transform: hidden ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 240ms var(--app-ease-out)",
          willChange: "transform",
        }}
      >
        <div className="mx-auto flex h-14 max-w-screen-md items-center gap-3 px-4">
          <Link
            href="/"
            aria-label="Frederick Radius — home"
            className="flex items-center gap-2 font-serif text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-[var(--app-shadow-1)]"
              style={{ background: "var(--app-brand)" }}
              aria-hidden
            >
              <Disc />
            </span>
            <span className="leading-tight">
              Frederick
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] -mt-0.5" style={{ color: "var(--app-ink-3)" }}>
                Radius
              </span>
            </span>
          </Link>

          {/* Search trigger — full-width input-styled pill so the
              header reads as "find anything" instead of three tiny
              icons competing for attention. Fills the space between
              the logo and the right-side chips, Apple-Maps style.
              Tap anywhere on it opens the typeahead modal. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search places, events, towns"
            className="ml-2 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {/* Rotating prompt. Keyed on the prompt itself so React
                remounts the span — pairs with the keyframe fade so a
                new prompt slides in cleanly without a layout jump. */}
            <span
              key={prompt}
              className="truncate text-left animate-[fadePrompt_360ms_var(--app-ease-out)_both]"
            >
              {prompt}
            </span>
            <kbd
              className="ml-auto hidden shrink-0 rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium leading-tight sm:inline-block"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              ⌘K
            </kbd>
          </button>

          <Link
            href="/my-radius"
            aria-label="Saved"
            title="Saved"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <Bookmark className="h-4 w-4" strokeWidth={1.75} aria-hidden />
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

          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
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
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>

          {/* LocationChip is hidden on the narrowest phones where the
              search bar needs the room; surfaces from sm: up. The user
              can still see/set location inside the search modal. */}
          <div className="hidden sm:block">
            <LocationChip />
          </div>
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
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
