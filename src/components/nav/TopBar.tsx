"use client";

import Link from "next/link";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Search, Compass, ChevronLeft, X } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";
import LocationChip from "./LocationChip";
import PulseIndicator from "./PulseIndicator";
import { usePathname, useRouter } from "next/navigation";
import { tabIndexForPath } from "./tabs";
import {
  consumeFindRequest,
  requestFind,
  type FindTarget,
} from "@/lib/findBridge";
import { haptic } from "@/lib/haptics";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

const SearchOverlay = lazy(() => import("@/components/search/SearchOverlay"));
let searchLayerSequence = 0;

export function pageOwnsPrimarySearch(pathname: string): boolean {
  return pathname === "/map"
    || pathname === "/search"
    || pathname === "/compass"
    || pathname.startsWith("/ask");
}

export function shouldShowGlobalMobileSearch(pathname: string): boolean {
  // A route that already opens with its own search or composer should not
  // repeat the same action in the 56px app bar.
  return !pageOwnsPrimarySearch(pathname);
}

export function topBarFindTarget(pathname: string): FindTarget {
  return pathname === "/map" ? "map" : "global";
}

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const searchLayerIdRef = useRef("");
  const searchPathRef = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const closeSearch = useCallback(() => setSearchOpen(false), []);

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

  // These routes own the middle of the header because their primary workspace
  // already contains a full search or query control. That changes the desktop
  // center treatment, but mobile still keeps one permanent global search
  // action so the app's primary utility never moves between screens.
  const pageOwnsSearch = pageOwnsPrimarySearch(pathname);
  const showMobileSearch = shouldShowGlobalMobileSearch(pathname);
  const findTarget = topBarFindTarget(pathname);
  const openPrimaryFind = useCallback((opener: HTMLElement | null) => {
    searchOpenerRef.current = opener;
    if (topBarFindTarget(pathname) === "map") {
      setSearchOpen(false);
      requestFind("map");
      return;
    }
    searchPathRef.current = pathname;
    if (!searchOpen) {
      searchLayerIdRef.current = `find:${Date.now()}:${++searchLayerSequence}`;
    }
    setSearchOpen(true);
  }, [pathname, searchOpen]);

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
    const open = () => {
      consumeFindRequest("global");
      searchOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      searchPathRef.current = pathname;
      if (!searchOpen) {
        searchLayerIdRef.current = `find:${Date.now()}:${++searchLayerSequence}`;
      }
      setSearchOpen(true);
    };
    window.addEventListener("fr:open-search", open);
    if (consumeFindRequest("global")) window.requestAnimationFrame(open);
    return () => window.removeEventListener("fr:open-search", open);
  }, [pathname, searchOpen]);

  // Search belongs to the route that opened it. The persistent app layout must
  // not let a still-loading overlay appear over a different destination after
  // browser Back or another navigation wins the race.
  useEffect(() => {
    if (!searchOpen || searchPathRef.current === pathname) return;
    setSearchOpen(false);
  }, [pathname, searchOpen]);

  // Cmd-K / Ctrl-K opens search globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPrimaryFind(
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
        );
      }
      // Forward slash as a quick-open (don't trigger when typing into another input)
      if (e.key === "/" && !searchOpen) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const role = target?.getAttribute("role");
        const editable = tag === "INPUT"
          || tag === "TEXTAREA"
          || tag === "SELECT"
          || target?.isContentEditable
          || role === "textbox"
          || role === "searchbox"
          || role === "combobox";
        if (!editable) {
          e.preventDefault();
          openPrimaryFind(
            document.activeElement instanceof HTMLElement ? document.activeElement : null,
          );
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPrimaryFind, searchOpen]);

  return (
    <>
      <header
        className="sticky top-0 border-b border-[var(--app-border)] bg-[var(--app-bg)]/90 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
        style={{
          // Tokenized z-index — see globals.css :root --z-* scale.
          zIndex: "var(--z-sticky)",
        }}
      >
        <div
          className="mx-auto flex h-[var(--app-topbar-h)] max-w-screen-md items-center gap-1.5 sm:gap-2 lg:max-w-screen-lg lg:pl-24"
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
              className="-ml-1.5 inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-1 font-semibold tracking-tight transition active:scale-[0.96] min-[390px]:justify-start min-[390px]:pl-1 min-[390px]:pr-2.5"
              style={{ color: "var(--app-ink)" }}
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              <span className="hidden text-[15px] min-[390px]:inline">Back</span>
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
              <span
                className={`${pathname === "/map" ? "hidden sm:block" : "hidden min-[430px]:block"} whitespace-nowrap leading-none`}
                style={{ color: "var(--app-ink)" }}
              >
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
                    <span className="hidden truncate font-sans text-[18px] font-semibold leading-none tracking-tight sm:block" style={{ color: "var(--app-ink)" }}>
                      Frederick County
                    </span>
                  </>
                ) : (
                  <span className="hidden truncate font-sans text-[18px] font-semibold leading-none tracking-tight lg:block" style={{ color: "var(--app-ink)" }}>
                    Compass
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
              {/* Mobile uses the circular header action rendered just after
                  this flexible spacer. Desktop gets the wider field because
                  the side rail leaves room for a descriptive search control. */}
              <div aria-hidden className="min-w-0 flex-1 lg:hidden" />
              <button
                type="button"
                onClick={(event) => {
                  openPrimaryFind(event.currentTarget);
                }}
                aria-label="Ask or find across Frederick County"
                className="tap-44 ml-1 hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)] lg:flex"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
              >
                <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate text-left">What do you need?</span>
                <kbd
                  className="ml-auto shrink-0 rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium leading-tight"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                >
                  ⌘K
                </kbd>
              </button>
            </>
          )}

          {showMobileSearch && (
            <button
              type="button"
              aria-label={findTarget === "map" ? "Search this map" : "Ask or find across Frederick County"}
              aria-haspopup={findTarget === "map" ? undefined : "dialog"}
              aria-controls={findTarget === "map" ? "map-search-input" : searchOpen ? "radius-find-dialog" : undefined}
              aria-expanded={findTarget === "map" ? undefined : searchOpen}
              title={findTarget === "map" ? "Search this map" : "Ask or find across Frederick County"}
              onClick={(event) => {
                haptic("light");
                openPrimaryFind(event.currentTarget);
              }}
              className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)] active:scale-95 lg:hidden"
              style={{
                borderColor: searchOpen ? "var(--app-brand)" : "var(--app-border)",
                color: searchOpen ? "var(--app-brand-press)" : "var(--app-ink-2)",
                background: searchOpen ? "var(--app-brand-tint-6)" : undefined,
              }}
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          )}

          {/* (Removed the header "My Radius" bookmark — it duplicated the
              My Radius primary nav tab/SideRail item, putting two bookmark
              icons on screen for one destination. My Radius stays one tap
              away via the bottom nav (<lg) and the SideRail (≥lg).) */}

          {/* Right cluster reads left→right: where you are, what's happening,
              then the county-wide Compass. Pulse and Compass are stable
              destinations rather than a conditional alert and a vague
              overflow button. Labels appear when the header has room; both
              destinations retain full touch targets and accessible names on
              narrow phones. */}
          <LocationChip />

          {/* Pulse stays named on larger screens. On a phone it appears only
              when active, unavailable, or already open, so safety never gets
              hidden but a quiet feed does not crowd the app bar. */}
          <PulseIndicator />

          {/* Compass is the field-guide index. Keep the destination visible on
              its own page so the top navigation does not change shape. */}
          <div className="hidden sm:contents">
            <Link
              href="/compass"
              prefetch={false}
              onMouseEnter={() => router.prefetch("/compass")}
              onFocus={() => router.prefetch("/compass")}
              onPointerDown={() => router.prefetch("/compass")}
              aria-label="Open Compass"
              aria-current={pathname === "/compass" ? "page" : undefined}
              title="Compass"
              className="relative inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-2 transition hover:bg-[var(--app-bg-sunken)] active:scale-95 sm:px-3"
              style={{
                borderColor: pathname === "/compass" ? "var(--app-brand)" : "var(--app-border)",
                color: pathname === "/compass" ? "var(--app-brand-press)" : "var(--app-ink-2)",
                background: pathname === "/compass" ? "var(--app-brand-tint-6)" : undefined,
              }}
            >
              <Compass className="h-[17px] w-[17px] shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden text-[14px] font-semibold leading-none sm:inline">Compass</span>
            </Link>
          </div>
        </div>
      </header>

      {searchOpen ? (
        <Suspense
          fallback={(
            <SearchOverlayFallback
              onClose={closeSearch}
              openerRef={searchOpenerRef}
              historyLayerId={searchLayerIdRef.current}
            />
          )}
        >
          <SearchOverlay
            open
            onClose={closeSearch}
            openerRef={searchOpenerRef}
            historyLayerId={searchLayerIdRef.current}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function SearchOverlayFallback({
  onClose,
  openerRef,
  historyLayerId,
}: {
  onClose: () => void;
  openerRef: RefObject<HTMLElement | null>;
  historyLayerId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, true);

  const finishDismiss = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => openerRef.current?.focus?.());
  }, [onClose, openerRef]);
  const historyLayer = useReversibleHistoryLayer({
    active: true,
    id: historyLayerId,
    onDismiss: finishDismiss,
  });
  const dismiss = historyLayer.dismiss;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [dismiss]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      id="radius-find-dialog"
      className="fixed inset-0 z-[var(--z-overlay)] bg-[var(--app-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label="Loading search"
    >
      <div
        className="mx-auto flex min-h-14 max-w-screen-sm items-center gap-3 px-4"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <Search
          className="h-5 w-5 shrink-0"
          strokeWidth={2}
          style={{ color: "var(--app-brand-press)" }}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 font-serif text-[20px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Ask or find
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          className="grid h-11 w-11 place-items-center rounded-full border"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-2)",
          }}
          aria-label="Close search"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="mx-auto max-w-screen-sm px-4 pt-3" role="status" aria-live="polite">
        <span className="sr-only">Loading search.</span>
        <div
          aria-hidden
          className="h-12 w-full animate-pulse rounded-full"
          style={{ background: "var(--app-bg-sunken)" }}
        />
        <div
          aria-hidden
          className="mt-5 h-3 w-28 animate-pulse rounded-full"
          style={{ background: "var(--app-bg-sunken)" }}
        />
        <div
          aria-hidden
          className="mt-3 h-16 w-full animate-pulse rounded-[var(--app-radius-md)]"
          style={{ background: "var(--app-bg-sunken)" }}
        />
      </div>
    </div>
  );
}
