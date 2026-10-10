"use client";

import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { EventWithMeta } from "@/lib/loaders/events";
import LazySheetFallback from "@/components/ui/LazySheetFallback";
import { browseReturnFromLocation, withBrowseReturnTo } from "@/lib/browse-return";
import { fetchEventSheetLookup } from "@/lib/event-sheet-lookup";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

const EventSheet = lazy(() => import("./EventSheet"));
let eventLayerSequence = 0;

/**
 * EventSheetProvider — the event half of the shared sheet system
 * (app-like pass, phase 2), mirroring PlaceSheetProvider: mounted once
 * in the app layout, any surface opens an event's essentials in place
 * via openEventSheet(event) instead of paying a page navigation per
 * "maybe". The full /events/[slug] page remains the canonical URL —
 * sheets never replace pages, they front-run them.
 *
 * Two open paths:
 *  - openEventSheet(event): the surface already holds the object
 *    (the events board) — instant.
 *  - openEventSheetBySlug(slug): lean surfaces (/today, /live-music)
 *    keep the corpus out of their client payload, so the sheet opens
 *    on a skeleton and fetches the one tapped event. If the fetch
 *    can't deliver, the tap falls back to the navigation it replaced —
 *    a slower answer, never a lost one.
 */
type Ctx = {
  openEventSheet: (e: EventWithMeta) => void;
  openEventSheetBySlug: (slug: string) => void;
  closeEventSheet: () => void;
};

const EventSheetContext = createContext<Ctx | null>(null);

export function EventSheetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [event, setEvent] = useState<EventWithMeta | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyLayerIdRef = useRef("");
  const openPathRef = useRef(pathname);
  const router = useRouter();
  // Monotonic request id: a stale fetch resolving after a newer open
  // (or after close) must never repopulate the sheet.
  const reqRef = useRef(0);
  const returnToRef = useRef<string | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const abortLookup = useCallback(() => {
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
  }, []);
  const captureOrigin = useCallback(() => {
    const current = typeof window === "undefined" ? null : new URL(window.location.href);
    openPathRef.current = current?.pathname ?? pathname;
    returnToRef.current = current ? browseReturnFromLocation(current) : null;
  }, [pathname]);

  useEffect(() => () => {
    reqRef.current++;
    abortLookup();
  }, [abortLookup]);

  const openEventSheet = useCallback((e: EventWithMeta) => {
    openerRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    historyLayerIdRef.current = `event-sheet:${Date.now()}:${++eventLayerSequence}`;
    reqRef.current++;
    abortLookup();
    captureOrigin();
    setPendingSlug(null);
    setEvent(e);
  }, [abortLookup, captureOrigin]);

  const openEventSheetBySlug = useCallback(
    (slug: string) => {
      openerRef.current =
        typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      historyLayerIdRef.current = `event-sheet:${Date.now()}:${++eventLayerSequence}`;
      captureOrigin();
      const req = ++reqRef.current;
      abortLookup();
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const historyLayerId = historyLayerIdRef.current;
      const returnTo = returnToRef.current;
      setEvent(null);
      setPendingSlug(slug);
      const goToCanonicalPage = () => {
        if (reqRef.current !== req) return;
        reqRef.current++;
        abortLookup();
        setEvent(null);
        setPendingSlug(null);
        navigateAfterHistoryLayer(historyLayerId, () => {
          router.push(withBrowseReturnTo(`/events/${encodeURIComponent(slug)}`, returnTo));
        });
      };
      fetchEventSheetLookup(slug, controller.signal)
        .then((resolved) => {
          if (reqRef.current !== req) return;
          if (!resolved) {
            goToCanonicalPage();
            return;
          }
          setEvent(resolved);
          setPendingSlug(null);
        })
        .catch(goToCanonicalPage)
        .finally(() => {
          if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
        });
    },
    [abortLookup, captureOrigin, router],
  );

  const closeEventSheet = useCallback(() => {
    reqRef.current++;
    abortLookup();
    setEvent(null);
    setPendingSlug(null);
  }, [abortLookup]);

  const openFullEventPage = useCallback(() => {
    const slug = pendingSlug ?? event?.slug;
    if (!slug) return;
    const historyLayerId = historyLayerIdRef.current;
    const returnTo = returnToRef.current;
    closeEventSheet();
    navigateAfterHistoryLayer(historyLayerId, () => {
      router.push(withBrowseReturnTo(`/events/${encodeURIComponent(slug)}`, returnTo));
    });
  }, [closeEventSheet, event, pendingSlug, router]);

  // The app layout persists across routes. Cancel both the sheet and any
  // in-flight summary request when navigation leaves the surface that opened
  // it, including while the lazy sheet bundle is still pending.
  useEffect(() => {
    if ((!event && !pendingSlug) || pathname === openPathRef.current) return;
    closeEventSheet();
  }, [closeEventSheet, event, pathname, pendingSlug]);

  return (
    <EventSheetContext.Provider value={{ openEventSheet, openEventSheetBySlug, closeEventSheet }}>
      {children}
      {event || pendingSlug ? (
        <Suspense
          fallback={(
            <LazySheetFallback
              label="Loading event details"
              onClose={closeEventSheet}
              onOpenFullPage={openFullEventPage}
              returnFocusRef={openerRef}
              historyLayerId={historyLayerIdRef.current}
            />
          )}
        >
          <EventSheet
            event={event}
            pending={pendingSlug !== null}
            onClose={closeEventSheet}
            onOpenFullPage={openFullEventPage}
            returnFocusRef={openerRef}
            historyLayerId={historyLayerIdRef.current}
          />
        </Suspense>
      ) : null}
    </EventSheetContext.Provider>
  );
}

export function useEventSheet(): Ctx {
  const ctx = useContext(EventSheetContext);
  if (!ctx) {
    // Graceful no-op outside the provider (e.g. a surface rendered in
    // isolation) — same contract as usePlaceSheet.
    return {
      openEventSheet: () => {},
      openEventSheetBySlug: () => {},
      closeEventSheet: () => {},
    };
  }
  return ctx;
}
