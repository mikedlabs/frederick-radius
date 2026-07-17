"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import EventSheet from "./EventSheet";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * EventSheetProvider — the event half of the shared sheet system
 * (app-like pass, phase 2), mirroring PlaceSheetProvider: mounted once
 * in the app layout, any surface opens an event's essentials in place
 * via openEventSheet(event) instead of paying a page navigation per
 * "maybe". The full /events/[slug] page remains the canonical URL —
 * sheets never replace pages, they front-run them.
 */
type Ctx = {
  openEventSheet: (e: EventWithMeta) => void;
  closeEventSheet: () => void;
};

const EventSheetContext = createContext<Ctx | null>(null);

export function EventSheetProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<EventWithMeta | null>(null);
  const openEventSheet = useCallback((e: EventWithMeta) => setEvent(e), []);
  const closeEventSheet = useCallback(() => setEvent(null), []);

  return (
    <EventSheetContext.Provider value={{ openEventSheet, closeEventSheet }}>
      {children}
      <EventSheet event={event} onClose={closeEventSheet} />
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
      closeEventSheet: () => {},
    };
  }
  return ctx;
}
