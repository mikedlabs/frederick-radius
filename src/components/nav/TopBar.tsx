"use client";

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
import AppTransitionLink from "./AppTransitionLink";
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

export function shouldShowGlobalLocation(pathname: string): boolean {
  // Ask owns its scope inside the composer. A second location control in the
  // persistent header showed two competing answers to "where am I looking?"
  return !pathname.startsWith("/ask");
}

export function topBarFindTarget(pathname: string): FindTarget {
  return pathname === "/map" ? "map" : "global";
}

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [findInteractionReady, setFindInteractionReady] = useState(false);
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const searchLayerIdRef = useRef("");
  const searchPathRef = useRef<string | null>(null);
  const searchReturnScrollYRef = useRef<number | null>(null);
  const pointerScrollYRef = useRef<number | null>(null);
  const scrollTrailRef = useRef({ previous: 0, current: 0, changedAt: 0 });
  const pathname = usePathname();
  const router = useRouter();
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // The app bar is server-rendered before this client component hydrates. An
  // enabled button in that brief window looks actionable but has no click
  // handler yet, so a fast first tap can be lost on a cold device. Match the
  // readiness contract used by other client-owned controls: expose the button
  // immediately, but enable it only after React can honor the interaction.
  useEffect(() => {
    queueMicrotask(() => setFindInteractionReady(true));
  }, []);

  // Sticky-header activation can make a browser reposition the document just
  // before it dispatches pointerdown (automation and mobile focus handling
  // both do this). Retain the immediately preceding coordinate so Find can
  // still return to the chapter the person was actually reading.
  useEffect(() => {
    const y = window.scrollY;
    scrollTrailRef.current = { previous: y, current: y, changedAt: 0 };
    const remember = () => {
      const next = window.scrollY;
      const trail = scrollTrailRef.current;
      if (Math.abs(next - trail.current) < 1) return;
      scrollTrailRef.current = {
        previous: trail.current,
        current: next,
        changedAt: performance.now(),
      };
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  const capturePointerScroll = useCallback(() => {
    const trail = scrollTrailRef.current;
    const recentBrowserReposition =
      trail.previous - trail.current >= 72 &&
      performance.now() - trail.changedAt <= 220;
    pointerScrollYRef.current = recentBrowserReposition
      ? trail.previous
      : window.scrollY;
  }, []);

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
  const openPrimaryFind = useCallback((
    opener: HTMLElement | null,
    returnScrollY = window.scrollY,
  ) => {
    searchOpenerRef.current = opener;
    if (topBarFindTarget(pathname) === "map") {
      setSearchOpen(false);
      requestFind("map");
      return;
    }
    searchPathRef.current = pathname;
    searchReturnScrollYRef.current = returnScrollY;
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
      searchReturnScrollYRef.current = window.scrollY;
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
          window.scrollY,
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
            window.scrollY,
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
        data-map-header={pathname === "/map" ? "true" : undefined}
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
            <AppTransitionLink
              href="/"
              prefetch={false}
              onMouseEnter={() => router.prefetch("/")}
              onFocus={() => router.prefetch("/")}
              aria-label={pathname === "/map" ? "Frederick Radius, home" : "Frederick Radius beta, home"}
              className="tap-44 flex items-center gap-2 font-brand text-[18px] tracking-[-0.015em]"
              style={{ color: "var(--app-brand)" }}
            >
              {/* Canonical horizontal lockup: the 24px+ two-arc Ripple beside
                  a one-line Libre Caslon wordmark. The app-icon tile belongs
                  on home screens and avatars, not inside the product header. */}
              <RippleMark size={pathname === "/map" ? 30 : 34} className="shrink-0" />
              {/* The wordmark yields on the narrowest phones so functional
                  controls retain a full touch target. The mark still carries
                  the brand there; the complete lockup returns at sm. */}
              <span
                className="hidden whitespace-nowrap leading-none sm:block"
                style={{ color: "var(--app-ink)" }}
              >
                Frederick Radius
              </span>
              {/* Product status belongs to the brand lockup, not the navigation:
                  it sets expectations without becoming another tool or tap
                  target. Keep it visible when the wordmark yields on phones. */}
              {pathname !== "/map" ? (
                <span
                  data-product-status="beta"
                  aria-hidden="true"
                  className="inline-flex h-[18px] shrink-0 items-center rounded-[4px] border px-1.5 font-sans text-[8px] font-bold uppercase leading-none tracking-[0.16em]"
                  style={{
                    borderColor: "var(--app-brand-tint-22)",
                    background: "var(--app-brand-tint-6)",
                    color: "var(--app-brand-press)",
                  }}
                >
                  Beta
                </span>
              ) : null}
            </AppTransitionLink>
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
                  <span className="hidden truncate font-sans text-[18px] font-semibold leading-none tracking-tight sm:block" style={{ color: "var(--app-ink)" }}>
                    Frederick County
                  </span>
                ) : null}
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
                disabled={!findInteractionReady}
                data-find-interaction-ready={findInteractionReady ? "true" : "false"}
                onPointerDown={capturePointerScroll}
                onClick={(event) => {
                  const returnScrollY = pointerScrollYRef.current ?? window.scrollY;
                  pointerScrollYRef.current = null;
                  openPrimaryFind(event.currentTarget, returnScrollY);
                }}
                aria-label="Ask or find across Frederick County"
                className="tap-44 ml-1 hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3 text-sm transition hover:bg-[var(--app-bg-sunken)] disabled:cursor-wait disabled:opacity-60 lg:flex"
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
              disabled={!findInteractionReady}
              data-find-interaction-ready={findInteractionReady ? "true" : "false"}
              aria-label={findTarget === "map" ? "Search this map" : "Ask or find across Frederick County"}
              aria-haspopup={findTarget === "map" ? undefined : "dialog"}
              aria-controls={findTarget === "map" ? "map-search-input" : searchOpen ? "radius-find-dialog" : undefined}
              aria-expanded={findTarget === "map" ? undefined : searchOpen}
              title={findTarget === "map" ? "Search this map" : "Ask or find across Frederick County"}
              onPointerDown={capturePointerScroll}
              onClick={(event) => {
                haptic("light");
                const returnScrollY = pointerScrollYRef.current ?? window.scrollY;
                pointerScrollYRef.current = null;
                openPrimaryFind(event.currentTarget, returnScrollY);
              }}
              className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-[var(--app-bg-elevated)] transition hover:bg-[var(--app-bg-sunken)] active:scale-95 disabled:cursor-wait disabled:opacity-60 lg:hidden"
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
          {shouldShowGlobalLocation(pathname) ? (
            <LocationChip compact={pathname === "/map"} />
          ) : null}

          {/* Pulse stays named on larger screens. On a phone it appears only
              when active, unavailable, or already open, so safety never gets
              hidden but a quiet feed does not crowd the app bar. */}
          <PulseIndicator />

          {/* Compass is the field-guide index. Keep the destination visible on
              its own page so the top navigation does not change shape. */}
          <div className="contents">
            <AppTransitionLink
              href="/compass"
              prefetch={false}
              onMouseEnter={() => router.prefetch("/compass")}
              onFocus={() => router.prefetch("/compass")}
              onPointerDown={() => router.prefetch("/compass")}
              aria-label="Open Compass tools"
              aria-current={pathname === "/compass" ? "page" : undefined}
              title="Compass tools"
              className="relative inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-2 transition hover:bg-[var(--app-bg-sunken)] active:scale-95 sm:px-3"
              style={{
                borderColor: pathname === "/compass" ? "var(--app-brand)" : "var(--app-border)",
                color: pathname === "/compass" ? "var(--app-brand-press)" : "var(--app-ink-2)",
                background: pathname === "/compass" ? "var(--app-brand-tint-6)" : undefined,
              }}
            >
              <Compass className="h-[17px] w-[17px] shrink-0" strokeWidth={2} aria-hidden />
              {/* 400, not 390. Three things used to appear at exactly 390px:
                  this label, the LocationChip's scope text, and its chevron.
                  Their sum needs 396px, so on a 390px viewport - iPhone
                  12/13/14/15/16, the single most common width there is - the
                  header overflowed by 5px and this chip's right border was
                  sliced off by the clip.

                  Delaying THIS label rather than the location text is the
                  trade worth making: the complete short location scope tells
                  you something, and "Tools" only repeats an icon that already
                  carries both an aria-label and a title. Nothing is lost but a
                  duplicate. */}
              <span className="hidden text-[12px] font-semibold leading-none min-[400px]:inline sm:hidden">Tools</span>
              <span className="hidden text-[14px] font-semibold leading-none sm:inline">Compass</span>
            </AppTransitionLink>
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
              returnScrollY={searchReturnScrollYRef.current}
            />
          )}
        >
          <SearchOverlay
            open
            onClose={closeSearch}
            openerRef={searchOpenerRef}
            historyLayerId={searchLayerIdRef.current}
            returnScrollY={searchReturnScrollYRef.current}
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
  returnScrollY,
}: {
  onClose: () => void;
  openerRef: RefObject<HTMLElement | null>;
  historyLayerId: string;
  returnScrollY: number | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef, true);

  const finishDismiss = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() =>
      openerRef.current?.focus?.({ preventScroll: true }),
    );
  }, [onClose, openerRef]);
  const historyLayer = useReversibleHistoryLayer({
    active: true,
    id: historyLayerId,
    onDismiss: finishDismiss,
    returnScrollY,
  });
  const dismiss = historyLayer.dismiss;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });

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
