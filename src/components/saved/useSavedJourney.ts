"use client";

import { useEffect, useRef, useState } from "react";
import { EMPTY_SAVED_JOURNEY, readSavedJourney, writeSavedJourney, type SavedJourney } from "./savedJourney";

/** Restore the same collection and card after a detail visit or reload.
 * Personal list names stay inside this tab and never enter URLs or analytics. */
export function useSavedJourney(ready: boolean) {
  const [journey, setJourney] = useState<SavedJourney>(EMPTY_SAVED_JOURNEY);
  const stateRef = useRef(journey);
  const hydratedRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    const saved = readSavedJourney();
    hydratedRef.current = true;
    if (saved) {
      stateRef.current = saved;
      setJourney(saved);
    }
  }, []);

  useEffect(() => {
    if (journey === EMPTY_SAVED_JOURNEY && stateRef.current !== EMPTY_SAVED_JOURNEY) return;
    stateRef.current = journey;
    if (hydratedRef.current) writeSavedJourney(journey);
  }, [journey]);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    let frame = 0;
    let attempts = 0;
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const target = stateRef.current.scrollY;
      // Lazy cards and the organizer need layout before a browser can reach
      // a deep saved position. Bound the retry; a removed card cannot trap it.
      if (document.documentElement.scrollHeight - window.innerHeight < target && attempts++ < 45) {
        frame = requestAnimationFrame(restore);
        return;
      }
      window.scrollTo({ top: target, behavior: "instant" });
      restoredRef.current = true;
    };
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(restore); });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [ready, journey]);

  useEffect(() => {
    let frame = 0;
    const save = () => {
      if (!restoredRef.current || window.location.pathname !== "/my-radius") return;
      const next = { ...stateRef.current, scrollY: window.scrollY };
      stateRef.current = next;
      writeSavedJourney(next);
    };
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(save);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("click", save, true);
    return () => {
      cancelAnimationFrame(frame);
      save();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("click", save, true);
    };
  }, []);

  function updateJourney(patch: Partial<Omit<SavedJourney, "scrollY">>) {
    setJourney((previous) => ({ ...previous, ...patch, scrollY: restoredRef.current ? window.scrollY : previous.scrollY }));
  }

  return { journey, updateJourney };
}
