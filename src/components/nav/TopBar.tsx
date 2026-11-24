"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Search, Compass, ChevronLeft, Menu, MessageSquare, X } from "lucide-react";
import RippleMark from "@/components/brand/RippleMark";
import styles from "./NavChrome.module.css";
import LocationChip from "./LocationChip";
import { feedbackInMoreMenu, requestFeedback } from "@/lib/feedback-ui";
import HeaderDisclosure from "./HeaderDisclosure";
import TodayAsk from "@/components/today/TodayAsk";
import TodayScopeStatus from "@/components/today/TodayScopeStatus";
import AppearanceControl from "./AppearanceControl";
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
import { installNativeReturnOwner, rememberNativeRequest } from "@/components/search/native-request-return";
import { useNativeRequestReturn } from "@/components/search/useNativeRequestReturn";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import { useScrollLock } from "@/hooks/useScrollLock";

import { forgetFindResult, readFindResultReturn } from "@/components/search/find-result-return";

const SearchOverlay = lazy(() => import("@/components/search/SearchOverlay"));
let searchLayerSequence = 0;
const FIND_DRAFT_KEY = "fr:find-draft:v1";

export function pageOwnsPrimarySearch(pathname: string): boolean {
  return pathname === "/today"
    || pathname === "/map"
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
  return !pathname.startsWith("/ask") && pathname !== "/today" && pathname !== "/search";
}

export function topBarFindTarget(pathname: string): FindTarget {
  return pathname === "/map" ? "map" : "global";
}

// The Find chord is Command on Apple keyboards and Control elsewhere. The
// server cannot know which, so it renders no hint and the client fills it in
// after hydration instead of printing a key the visitor may not have.
const subscribeToNothing = () => () => undefined;
const readAppleKeyboard = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const readUnknownKeyboard = () => null;

/** Is this key event aimed at something the visitor is typing into? */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const role = target.getAttribute("role");
  return target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
    || target.isContentEditable
    || role === "textbox"
    || role === "searchbox"
    || role === "combobox";
}

/** Another active modal owns input until its existing dismissal completes. */
function anotherModalOwnsInput(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .some((dialog) => dialog.id !== "radius-find-dialog"
      && !dialog.closest('[inert], [hidden], [aria-hidden="true"]'));
}

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const returnPlaceRef = useRef<string | null>(null);
  const searchDraftRef = useRef("");
  const searchDraftNeedsStorageRef = useRef(false);
  const [findInteractionReady, setFindInteractionReady] = useState(false);
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const searchLayerIdRef = useRef("");
  const searchPathRef = useRef<string | null>(null);
  const searchReturnScrollYRef = useRef<number | null>(null);
  const pointerScrollYRef = useRef<number | null>(null);
  const scrollTrailRef = useRef({ previous: 0, current: 0, changedAt: 0 });
  const pathname = usePathname();
  const router = useRouter();
  const toolsOpenerRef = useRef<HTMLAnchorElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const appleKeyboard = useSyncExternalStore<boolean | null>(
    subscribeToNothing,
    readAppleKeyboard,
    readUnknownKeyboard,
  );

  const findShortcut = appleKeyboard === null ? undefined : appleKeyboard ? "Meta+K" : "Control+K";

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const root = document.documentElement;
    const property = "--app-topbar-h";
    const previous = root.style.getPropertyValue(property);
    const previousPriority = root.style.getPropertyPriority(property);
    let published: string | null = null;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      // The row excludes the header's safe-top padding and bottom border.
      // Map/picker consumers already account for their own safe inset.
      const height = row.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      const value = `${height}px`;
      if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
      published = value;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    window.addEventListener("resize", measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (published !== null && root.style.getPropertyValue(property) === published) {
        if (previous) root.style.setProperty(property, previous, previousPriority);
        else root.style.removeProperty(property);
      }
    };
  }, []);
  useEffect(installNativeReturnOwner, []);
  useNativeRequestReturn({ target: "tools-opener", inputRef: toolsOpenerRef, pathname, ready: findInteractionReady });
  const closeSearch = useCallback(() => {
    forgetFindResult(searchLayerIdRef.current);
    returnPlaceRef.current = null;
    setSearchOpen(false);
  }, []);

  // The overlay stays lazy and unmounts on close. Only its query survives in
  // this tab, including the existing full navigation to a result. Never retain
  // results, hours, source freshness, coordinates, or a previous area here.
  const restoreSearchDraft = useCallback(() => {
    // Back can revive this header from BFCache after another page in this
    // tab edited or cleared Find. Read storage again unless our own latest
    // edit failed to persist; a readable older value must not replace it.
    if (!searchDraftNeedsStorageRef.current) {
      try {
        searchDraftRef.current = window.sessionStorage.getItem(FIND_DRAFT_KEY) ?? "";
      } catch {
        // Retain this header's latest words while reads are blocked.
      }
    }
    setSearchInitialQuery(searchDraftRef.current);
  }, []);
  const rememberSearchDraft = useCallback((query: string) => {
    // Update before dismissal or navigation can unmount the input. Memory is
    // also the fallback when browser storage is unavailable or full.
    searchDraftRef.current = query;
    try {
      if (query) window.sessionStorage.setItem(FIND_DRAFT_KEY, query);
      else window.sessionStorage.removeItem(FIND_DRAFT_KEY);
      searchDraftNeedsStorageRef.current = false;
    } catch {
      searchDraftNeedsStorageRef.current = true;
    }
  }, []);

  // Native Back can resume the original document from BFCache or mount a
  // fresh shell. Reuse that entry's layer ID so reopening adds no history step.
  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== pathname || anotherModalOwnsInput()) return;
      const result = readFindResultReturn();
      if (!result) return;
      if (!searchOpenerRef.current?.isConnected) {
        searchOpenerRef.current = Array.from(document.querySelectorAll<HTMLElement>("[data-find-interaction-ready]"))
          .find((button) => button.getClientRects().length > 0) ?? null;
      }
      searchPathRef.current = pathname;
      searchLayerIdRef.current = result.id;
      searchReturnScrollYRef.current = result.scrollY;
      returnPlaceRef.current = result.href;
      // The history entry owns this query. A newer edit or clear on the
      // detail page still belongs to the next manually opened Find.
      setSearchInitialQuery(result.query);
      setSearchOpen(true);
    };
    restore();
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", restore);
    };
  }, [pathname]);

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

  const showGlobalFind = shouldShowGlobalMobileSearch(pathname);
  const openPrimaryFind = useCallback((
    opener: HTMLElement | null,
    returnScrollY = window.scrollY,
  ) => {
    if (anotherModalOwnsInput()) return;
    searchOpenerRef.current = opener;
    if (topBarFindTarget(pathname) === "map") {
      setSearchOpen(false);
      requestFind("map");
      return;
    }
    searchPathRef.current = pathname;
    searchReturnScrollYRef.current = returnScrollY;
    if (!searchOpen) {
      restoreSearchDraft();
      searchLayerIdRef.current = `find:${Date.now()}:${++searchLayerSequence}`;
    }
    setSearchOpen(true);
  }, [pathname, restoreSearchDraft, searchOpen]);

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
      if (anotherModalOwnsInput()) return;
      searchReturnScrollYRef.current = window.scrollY;
      searchOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      searchPathRef.current = pathname;
      if (!searchOpen) {
        restoreSearchDraft();
        searchLayerIdRef.current = `find:${Date.now()}:${++searchLayerSequence}`;
      }
      setSearchOpen(true);
    };
    window.addEventListener("fr:open-search", open);
    if (consumeFindRequest("global")) window.requestAnimationFrame(open);
    return () => window.removeEventListener("fr:open-search", open);
  }, [pathname, restoreSearchDraft, searchOpen]);

  // Search belongs to the route that opened it. The persistent app layout must
  // not let a still-loading overlay appear over a different destination after
  // browser Back or another navigation wins the race.
  useEffect(() => {
    if (!searchOpen || searchPathRef.current === pathname) return;
    setSearchOpen(false);
  }, [pathname, searchOpen]);

  // Cmd/Ctrl+K and forward slash open search globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The chord printed in the desktop search field. It cannot be typed as
      // text, so unlike slash it also works from inside another field. The
      // app takes it from the browser (Chrome and Firefox bind Ctrl+K to
      // their own search field), and an open Find keeps its first opener.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        // The one exception: on an Apple keyboard the chord is Command, and
        // Control+K inside a field is the system's delete-to-end-of-line.
        if (appleKeyboard && !e.metaKey && typingInto(e.target)) return;
        // Another open modal owns the keyboard, and Find will not open over
        // it, so leave the chord to that modal and the browser.
        if (anotherModalOwnsInput()) return;
        e.preventDefault();
        if (!searchOpen) {
          openPrimaryFind(
            document.activeElement instanceof HTMLElement ? document.activeElement : null,
            window.scrollY,
          );
        }
        return;
      }
      // Forward slash as a quick-open (don't trigger when typing into another input)
      if (e.key === "/" && !searchOpen && !typingInto(e.target)) {
        e.preventDefault();
        openPrimaryFind(
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
          window.scrollY,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appleKeyboard, openPrimaryFind, searchOpen]);

  return (
    <>
      <header
        data-today-header={pathname === "/today" || undefined}
        data-map-header={pathname === "/map" ? "true" : undefined}
        className={`${styles.bar} sticky top-0 border-b border-[var(--app-border)] pt-[env(safe-area-inset-top)]`}
        style={{
          // Tokenized z-index — see globals.css :root --z-* scale.
          zIndex: "var(--z-sticky)",
        }}
      >
        <div
          ref={rowRef}
          data-app-topbar-row
          className={styles.row}
        >
          <div data-header-identity className={styles.identity}>
            {isDeepPage ? (
              // Deep page: a clear way back, so no screen is a dead-end.
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                data-header-back
                className={styles.back}
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2.25} aria-hidden />
                <span>Back</span>
              </button>
            ) : (
              <AppTransitionLink
                href="/"
                prefetch={false}
                onMouseEnter={() => router.prefetch("/")}
                onFocus={() => router.prefetch("/")}
                aria-label="Frederick Radius, home"
                className={`${styles.home} font-brand`}
              >
                <RippleMark size={32} />
                <span data-header-wordmark>
                  Frederick Radius
                </span>
              </AppTransitionLink>
            )}
          </div>
          <div data-header-actions className={styles.actions}>
            {pathname === "/today" && <TodayAsk embedded density="header" showQuickNeeds={false} shortcut={findShortcut} />}
            {showGlobalFind && (
              <button
                type="button"
                disabled={!findInteractionReady}
                data-find-interaction-ready={findInteractionReady ? "true" : "false"}
                aria-label="Ask or find across Frederick County"
                aria-haspopup="dialog"
                aria-controls={searchOpen ? "radius-find-dialog" : undefined}
                aria-expanded={searchOpen}
                aria-keyshortcuts={findShortcut}
                onPointerDown={capturePointerScroll}
                onClick={(event) => {
                  haptic("light");
                  const returnScrollY = pointerScrollYRef.current ?? window.scrollY;
                  pointerScrollYRef.current = null;
                  openPrimaryFind(event.currentTarget, returnScrollY);
                }}
                className={styles.search}
              >
                <Search size={18} strokeWidth={1.8} aria-hidden />
                <span>Find</span>
                {appleKeyboard !== null && <kbd aria-hidden>{appleKeyboard ? "⌘K" : "Ctrl K"}</kbd>}
              </button>
            )}
            <HeaderDisclosure
              key={pathname}
              name="tools"
              label="More tools"
              trigger={<><Menu aria-hidden size={18} strokeWidth={1.8} /><span>More</span></>}
            >
              <AppTransitionLink
                ref={toolsOpenerRef}
                href="/compass"
                onClick={(event) => {
                  if (event.button === 0 && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    rememberNativeRequest({ target: "tools-opener" });
                  }
                }}
                prefetch={false}
                onMouseEnter={() => router.prefetch("/compass")}
                onFocus={() => router.prefetch("/compass")}
                onPointerDown={() => router.prefetch("/compass")}
                aria-label="Open tools"
                aria-current={pathname === "/compass" ? "page" : undefined}
                className={styles.utilityRow}
              >
                <Compass size={20} strokeWidth={1.75} aria-hidden />
                <span>Tools</span>
                {pathname === "/compass" ? <span aria-hidden data-top-tool-rule /> : null}
              </AppTransitionLink>
              {feedbackInMoreMenu(pathname) && (
                <button type="button" className={styles.utilityRow} aria-haspopup="dialog"
                  disabled={!findInteractionReady}
                  onClick={event => {
                    const menu = event.currentTarget.closest("details");
                    const opener = menu?.querySelector("summary") ?? event.currentTarget;
                    if (menu) menu.open = false;
                    requestFeedback(opener);
                  }}>
                  <MessageSquare size={20} strokeWidth={1.75} aria-hidden />
                  <span>Send feedback</span>
                </button>
              )}
              <AppearanceControl />
            </HeaderDisclosure>
          </div>
          <div data-header-context className={styles.context}>
            {pathname === "/today" ? (
              <Suspense fallback={null}><TodayScopeStatus density="header" /></Suspense>
            ) : shouldShowGlobalLocation(pathname) ? (
              <Suspense fallback={null}><LocationChip /></Suspense>
            ) : null}
            <PulseIndicator />
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
            initialQuery={searchInitialQuery}
            returnPlaceHref={returnPlaceRef.current}
            onQueryChange={rememberSearchDraft}
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

  useScrollLock(true);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
          style={{ color: "var(--app-link)" }}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 font-sans text-[20px] font-bold tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          Ask or find
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          className="grid h-11 w-11 place-items-center rounded-[var(--app-radius-sm)] border"
          style={{
            borderColor: "var(--app-control-border)",
            color: "var(--app-ink)",
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
          className="h-12 w-full animate-pulse rounded-[var(--app-radius-md)]"
          style={{ background: "var(--app-bg-sunken)" }}
        />
        <div
          aria-hidden
          className="mt-5 h-3 w-28 animate-pulse rounded-[var(--app-radius-sm)]"
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
