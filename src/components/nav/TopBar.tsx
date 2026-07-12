"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Compass, ChevronLeft } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import LocationChip from "./LocationChip";
import MoreSheet from "./MoreSheet";
import PulseIndicator from "./PulseIndicator";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useHideOnScroll(searchOpen);

  // Has the user navigated WITHIN the app since arriving? The TopBar lives in
  // the (app) layout, which persists across navigations, so counting pathname
  // changes here reliably tells an in-app Back (safe) from a cold arrival
  // (deep link / new tab / shared URL) where router.back() would bounce the
  // user OFF-SITE — to Google, the referrer — instead of into Frederick Radius
  // (2026-07-12 audit: window.history.length is not app-aware).
  const inAppNavs = useRef(0);
  const seenFirstPath = useRef(false);
  useEffect(() => {
    if (seenFirstPath.current) inAppNavs.current += 1;
    else seenFirstPath.current = true;
  }, [pathname]);

  // Publish the bar's real bottom edge as --app-topbar-offset on <html> so
  // sticky bars pinned under it (RightNow's filter bar, the /events dock)
  // collapse in sync with the auto-hide instead of orphaning a band of raw
  // list above themselves. Removing the inline value falls back to the
  // :root default (= --app-topbar-h); consumers transition `top` at the
  // same 240ms ease this header uses for its transform.
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.style.setProperty("--app-topbar-offset", "0px");
    else root.style.removeProperty("--app-topbar-offset");
    return () => {
      root.style.removeProperty("--app-topbar-offset");
    };
  }, [hidden]);

  // /map folds its own search into the dock ("the map's ONE search", same
  // index as this bar's overlay), and the page never scrolls, so the
  // auto-hide can't resolve the duplication — two stacked search fields
  // would sit in the top 130px permanently. Suppress the pill there; the
  // wordmark, pulse, and Browse stay, and ⌘K still opens the overlay.
  const isMapSurface = pathname === "/map";

  // Deep page = anything that isn't one of the 4 bottom-nav tabs (or its
  // sub-route) and isn't the root. On these the bottom nav lights NO
  // tab, so without a back control the user is stranded — the #1 cause
  // of the "I tapped something and got dumped with no way back" feel.
  // The left slot becomes a Back button here instead of the wordmark.
  const isDeepPage = pathname !== "/" && tabIndexForPath(pathname) === -1;
  const goBack = () => {
    // Only trust history.back() when the previous entry is KNOWN to be ours —
    // i.e. the user has navigated within the app. On a cold arrival, go to the
    // front door instead of bouncing them off-site (the old test,
    // window.history.length > 1, is true even when the prior entry is Google).
    if (inAppNavs.current > 0) {
      router.back();
    } else {
      router.push("/today");
    }
  };

  // Close the More sheet on route change — the drawer would otherwise
  // cover the new page after the user tapped one of its items.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: dismiss the drawer when the user navigates away
    setMoreOpen(false);
  }, [pathname]);

  // Let any surface open the More drawer (the /today "I want… More…" tile
  // fires this) without owning its state — the TopBar stays the single owner.
  useEffect(() => {
    const open = () => setMoreOpen(true);
    window.addEventListener("fr:open-more", open);
    return () => window.removeEventListener("fr:open-more", open);
  }, []);

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
          className="mx-auto flex h-[var(--app-topbar-h)] max-w-screen-md lg:max-w-screen-lg lg:pl-24 items-center gap-2"
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
              className="-ml-1.5 inline-flex h-11 items-center gap-1 rounded-full pl-1 pr-2.5 font-semibold tracking-tight transition active:scale-[0.96]"
              style={{ color: "var(--app-ink)" }}
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              <span className="text-[15px]">Back</span>
            </button>
          ) : (
            <Link
              href="/"
              aria-label="Frederick Radius, home"
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

          {/* Search trigger — full-width input-styled pill so the
              header reads as "find anything" instead of three tiny
              icons competing for attention. Fills the space between
              the logo and the right-side chips, Apple-Maps style.
              Tap anywhere on it opens the typeahead modal. */}
          {isMapSurface ? (
            // Spacer keeps the right cluster (pulse · Browse) on the right
            // edge while the dock below owns search on this surface.
            <div aria-hidden className="min-w-0 flex-1" />
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search places, events, towns"
              className="tap-44 ml-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {/* Calm, static placeholder. ONE text node (truncates on
                  narrow phones) — the previous two responsive spans both
                  lived in the DOM, so non-CSS readers and audit tools saw
                  them concatenated ("What's open?What's open right now?").
                  The button's aria-label is the accessible name; this text
                  is decorative. */}
              <span className="truncate text-left">Search places, events, towns…</span>
              <kbd
                className="ml-auto hidden shrink-0 rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium leading-tight sm:inline-block"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                ⌘K
              </kbd>
            </button>
          )}

          {/* (Removed the header "My Radius" bookmark — it duplicated the
              My Radius primary nav tab/SideRail item, putting two bookmark
              icons on screen for one destination. My Radius stays one tap
              away via the bottom nav (<lg) and the SideRail (≥lg).) */}

          {/* Settings — visible at all viewports. The original
              design hid this on mobile and routed mobile users via
              the /saved page (which has its own Settings link), but
              that's a non-obvious two-tap path no real user will
              discover. Settings is the only surface that lets you
              change persona, home muni, interests, and notifications,
              so it has to be one tap from anywhere. LocationChip
              stays mobile-hidden because the search modal carries
              the same affordance. */}
          {/* Right cluster reads left→right: where you are (LocationChip,
              nearest search), what's happening (PulseIndicator), then the
              catch-all field-guide drawer LAST — the conventional spot for an
              overflow control. LocationChip is hidden on the narrowest phones
              where the search bar needs the room (location is still settable
              inside the search modal); it surfaces from sm: up. */}
          <div className="hidden sm:block">
            <LocationChip />
          </div>

          {/* Live county pulse — lights up on an active NWS/school alert,
              traffic incident, or significant outage; quiet otherwise. */}
          <PulseIndicator />

          {/* "Explore" opens the field-guide index — the complete directory of
              every surface (Discover, Outdoors, Around the county, Contribute,
              App…), so nothing is reachable only by typing a URL. A compass +
              visible label from sm: up makes the whole guide discoverable rather
              than buried under a bare "⋯". tap-44 keeps the 44px target. */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-label="Browse"
            title="Browse"
            className="tap-44 relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-2.5 transition hover:bg-[var(--app-bg-sunken)] active:scale-95 sm:px-3"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            <Compass className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
            <span className="hidden text-[14px] font-medium leading-none sm:inline">Browse</span>
          </button>
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
