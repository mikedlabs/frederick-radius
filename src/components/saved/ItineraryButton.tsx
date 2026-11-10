"use client";

import { useEventSavedState, useMounted, useSetEventSaved, savedChangeDescription } from "@/hooks/useSaved";
import { useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { notifyError, notifyRemoved, notifySaved } from "@/lib/feedback/notify";

/** Retain the existing event-card call sites while using the same event save
 * authority as the full page and Saved tab. Legacy Day Plan data is untouched. */
export default function ItineraryButton({
  eventId,
  label,
  className = "",
}: {
  eventId: string;
  label?: string;
  className?: string;
}) {
  const mounted = useMounted();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const savedState = useEventSavedState(eventId);
  const isSaved = savedState === true;
  const setSaved = useSetEventSaved(eventId);
  const eventName = label?.replace(/^Add\s+/, "").replace(/\s+to itinerary$/, "") || "event";

  // One path for the tap and for Undo. Undo reports its own failure and stays
  // quiet on success: the bookmark flipping back is the confirmation.
  async function change(next: boolean, undoing = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (await setSaved(next) !== next) throw new Error("Saved change not confirmed");
      if (undoing) return;
      const item = { type: "event", id: eventId } as const;
      if (next) notifySaved({ label: eventName, onUndo: () => void change(false, true), item });
      else notifyRemoved({ label: eventName, onUndo: () => void change(true, true), item });
    } catch (error) {
      notifyError({
        title: undoing ? "Could not undo this change" : next ? "Could not save this event" : "Could not remove from Saved",
        description: savedChangeDescription(error),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-save-ref={`event:${eventId}`}
      disabled={!mounted || savedState === null || busy}
      aria-busy={busy || undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void change(!isSaved);
      }}
      aria-pressed={savedState === null ? undefined : mounted && isSaved}
      aria-label={busy ? `${isSaved ? "Removing" : "Saving"} ${eventName}` : savedState === null ? `Saved state unavailable for ${eventName}` : isSaved ? `Remove ${eventName} from Saved` : `Save ${eventName}`}
      title={savedState === null ? "Saved state unavailable" : isSaved ? "Saved" : "Save"}
      className={`tap-44 relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${className}`}
      style={{
        color: isSaved ? "var(--app-link)" : "var(--app-ink-2)",
        background: "var(--app-bg-elevated-solid)",
        borderColor: "var(--app-border)",
      }}
    >
      <Bookmark className="h-4 w-4" strokeWidth={isSaved ? 0 : 1.75} fill={isSaved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
