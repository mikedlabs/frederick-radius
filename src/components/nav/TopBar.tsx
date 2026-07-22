"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search, Compass, ChevronLeft } from "lucide-react";
import SearchOverlay from "@/components/search/SearchOverlay";
import RippleMark from "@/components/brand/RippleMark";
import LocationChip from "./LocationChip";
import PulseIndicator from "./PulseIndicator";
import { usePathname, useRouter } from "next/navigation";
import { useHideOnScroll } from "./useHideOnScroll";
import { tabIndexForPath } from "./tabs";


export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
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
  // same medium-duration ease this header uses for its transform.
  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.style.setProperty("--app-topbar-offset", "0px");
    else root.style.removeProperty("--app-topbar-offset");
    return () => {
      root.style.removeProperty("--app-topbar-offset");
    };
  }, [hidden]);

  // /map and /search each own a full search control. Suppress the global
  // trigger on those routes so people never have to choose between two
  // search boxes that do the same job. The wordmark/back control, pulse,
  // Compass, and the ⌘K shortcut remain available.
  const pageOwnsSearch = pathname === "/map"
    || pathname === "/search"
    || pathname === "/compass"
    || pathname.startsWith("/ask");

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

  // Backward-compatible bridge for any surface that still emits the old
  // "open more" event. Compass is now a real page: it has history, a shareable
  // URL, reliable scrolling, and enough room for a useful hierarchy.
  useEffect(() => {
    const open = () => router.push("/compass");
    window.addEventListener("fr:open-more", open);
    return () => window.removeEventListener("fr:open-more", open);
  }, [router]);

  // Compass and other in-page launchers can open the one global search
  // without mounting a second search implementation.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener("fr:open-search", open);
    return () => window.removeEventListener("fr:open-search", open);
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
          transition: "transform var(--app-dur-med) var(--app-ease-out)",
          willChange: "transform",
        }}
      >
        <div
          className="mx-auto flex h-[var(--app-topbar-h)] max-w-screen-md items-center gap-2 lg:max-w-screen-lg lg:pl-24"
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
              prefetch={false}
              onMouseEnter={() => router.prefetch("/")}
              onFocus={() => router.prefetch("/")}
              aria-label="Frederick Radius, home"
              className="tap-44 flex items-center gap-2 font-brand text-[18px] tracking-[-0.015em]"
              style={{ color: "var(--app-brand)" }}
            >
              {/* Canonical horizontal lockup: the 24px+ two-arc Ripple beside
                  a one-line Libre Caslon wordmark. The app-icon tile belongs
                  on home screens and avatars, not inside the product header. */}
              <RippleMark size={34} className="shrink-0" />
              {/* The wordmark yields on the narrowest phones so functional
                  controls retain a full touch target. The mark still carries
                  the brand there; the complete lockup returns at sm. */}
              <span className="hidden whitespace-nowrap leading-none min-[375px]:block" style={{ color: "var(--app-ink)" }}>
                Frederick Radius
              </span>
            </Link>
          )}

          {/* Search trigger — full-width input-styled pill so the
              header reads as "find anything" instead of three tiny
              icons competing for attention. Fills the space between
              the logo and the right-side chips, Apple-Maps style.
              Tap anywhere on it opens the typeahead modal. */}
          {pageOwnsSearch ? (
            pathname === "/map" || pathname === "/compass" ? (
              // The map's search moved into the dock at the foot of the screen,
              // which left this bar a lone disc over dead space. Name the
              // territory here in one quiet line of the display serif so the
              // header reads like a field-guide map sheet — a title, not a
              // control (the disc beside it is the home button). flex-1 still
              // pins the pulse · Compass cluster to the right edge.
              <div className="ml-1 min-w-0 flex-1">
                {pathname === "/map" ? (
                  <>
                    <span className="block truncate font-sans text-[18px] font-semibold leading-none tracking-tight sm:hidden" style={{ color: "var(--app-ink)" }}>
                      County map
                    </span>
                    <span className="hidden truncate font-sans text-[18px] font-semibold leading-none tracking-tight sm:block" style={{ color: "var(--app-ink)" }}>
                      Frederick County
                    </span>
                  </>
                ) : (
                  <span className="block truncate font-sans text-[18px] font-semibold leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
                    All tools
                  </span>
                )}
              </div>
            ) : (
              // Spacer keeps the right cluster (pulse · Browse) on the right
              // edge while the dock below owns search on this surface.
              <div aria-hidden className="min-w-0 flex-1" />
            )
          ) : (
            <>
              {/* Mobile already has the prominent center Find action in the
                  fixed primary nav. Repeating the same search control here
                  made every page open with two competing discovery doors.
                  Keep the middle of the top bar calm until the desktop layout,
                  where the bottom nav is gone and this search becomes primary. */}
              <div aria-hidden className="min-w-0 flex-1 lg:hidden" />
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search Frederick County"
                className="tap-44 ml-1 hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)] lg:flex"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate text-left">Find places, events, towns, tools</span>
                <kbd
                  className="ml-auto shrink-0 rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium leading-tight"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                >
                  ⌘K
                </kbd>
              </button>
            </>
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

          {/* Compass is the field-guide index. It is a full destination rather
              than a tall modal, so it can be linked, shared, scrolled, and
              returned from with normal browser history. */}
          {pathname !== "/compass" && <Link
            href="/compass"
            prefetch={false}
            onMouseEnter={() => router.prefetch("/compass")}
            onFocus={() => router.prefetch("/compass")}
            onPointerDown={() => router.prefetch("/compass")}
            aria-label="Open all Frederick Radius tools"
            aria-current={pathname === "/compass" ? "page" : undefined}
            title="Open all tools"
            className="tap-44 relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-2.5 transition hover:bg-[var(--app-bg-sunken)] active:scale-95 sm:px-3"
            style={{
              borderColor: pathname === "/compass" ? "var(--app-brand)" : "var(--app-border)",
              color: pathname === "/compass" ? "var(--app-brand-press)" : "var(--app-ink-2)",
            }}
          >
            <Compass className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
            <span className="text-[14px] font-medium leading-none">All tools</span>
          </Link>}
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
