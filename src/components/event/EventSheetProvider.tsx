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

  const openEventSheet = useCallback((e: EventWithMeta) => {
    openerRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    historyLayerIdRef.current = `event-sheet:${Date.now()}:${++eventLayerSequence}`;
    reqRef.current++;
    openPathRef.current = pathname;
    setPendingSlug(null);
    setEvent(e);
  }, [pathname]);

  const openEventSheetBySlug = useCallback(
    (slug: string) => {
      openerRef.current =
        typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      historyLayerIdRef.current = `event-sheet:${Date.now()}:${++eventLayerSequence}`;
      openPathRef.current = pathname;
      const req = ++reqRef.current;
      setEvent(null);
      setPendingSlug(slug);
      // The attendance summary now includes canonical venue coordinates and
      // owner notices. Version its URL so an installed app cannot reuse the
      // older cached shape after updating its client bundle.
      fetch(`/api/events/${encodeURIComponent(slug)}/summary?v=attendance-2`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (reqRef.current !== req) return; // superseded or closed
          if (d?.event) {
            setEvent(d.event as EventWithMeta);
            setPendingSlug(null);
          } else {
            // The unified set doesn't know this slug (rotated out, or a
            // page-only event) — honor the tap with the page it meant.
            setPendingSlug(null);
            navigateAfterHistoryLayer(historyLayerIdRef.current, () => {
              router.push(`/events/${slug}`);
            });
          }
        })
        .catch(() => {
          if (reqRef.current !== req) return;
          setPendingSlug(null);
          navigateAfterHistoryLayer(historyLayerIdRef.current, () => {
            router.push(`/events/${slug}`);
          });
        });
    },
    [pathname, router],
  );

  const closeEventSheet = useCallback(() => {
    reqRef.current++;
    setEvent(null);
    setPendingSlug(null);
  }, []);

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
              returnFocusRef={openerRef}
              historyLayerId={historyLayerIdRef.current}
            />
          )}
        >
          <EventSheet
            event={event}
            pending={pendingSlug !== null}
            onClose={closeEventSheet}
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
