"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import EventSheet from "./EventSheet";
import type { EventWithMeta } from "@/lib/loaders/events";

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
  const [event, setEvent] = useState<EventWithMeta | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const router = useRouter();
  // Monotonic request id: a stale fetch resolving after a newer open
  // (or after close) must never repopulate the sheet.
  const reqRef = useRef(0);

  const openEventSheet = useCallback((e: EventWithMeta) => {
    reqRef.current++;
    setPendingSlug(null);
    setEvent(e);
  }, []);

  const openEventSheetBySlug = useCallback(
    (slug: string) => {
      const req = ++reqRef.current;
      setEvent(null);
      setPendingSlug(slug);
      fetch(`/api/events/${encodeURIComponent(slug)}/summary`)
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
            router.push(`/events/${slug}`);
          }
        })
        .catch(() => {
          if (reqRef.current !== req) return;
          setPendingSlug(null);
          router.push(`/events/${slug}`);
        });
    },
    [router],
  );

  const closeEventSheet = useCallback(() => {
    reqRef.current++;
    setEvent(null);
    setPendingSlug(null);
  }, []);

  return (
    <EventSheetContext.Provider value={{ openEventSheet, openEventSheetBySlug, closeEventSheet }}>
      {children}
      <EventSheet event={event} pending={pendingSlug !== null} onClose={closeEventSheet} />
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
