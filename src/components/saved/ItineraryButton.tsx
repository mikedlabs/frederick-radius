"use client";

import { useEventSavedState, useMounted, useSetEventSaved, savedChangeDescription } from "@/hooks/useSaved";
import { useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { notifyError, notifyRemoved, notifySaved } from "@/lib/feedback/notify";
import { LABELED_EVENT_ACTION_CLASS } from "@/components/event/EventActions";
import { SAVE_ICON_CLASS } from "./SaveButton";

// The three shapes share one button and one save path. "boxed" is the
// original bordered 36px square. "plain" is SaveButton's unboxed glyph, for a
// list where a box on every row would be noise. "labeled" is EventActions'
// labeled shape, so Save can lead a row of labeled actions. Every shape keeps
// a 44px target.
const SHAPE = {
  boxed: "tap-44 relative grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-md)] border transition-colors",
  plain: `${SAVE_ICON_CLASS} shrink-0`,
  labeled: `${LABELED_EVENT_ACTION_CLASS} shrink-0`,
} as const;

/** Retain the existing event-card call sites while using the same event save
 * authority as the full page and Saved tab. Legacy Day Plan data is untouched. */
export default function ItineraryButton({
  eventId,
  eventName: name,
  appearance = "boxed",
  className = "",
}: {
  eventId: string;
  /** The event's display title. The control is named "Save <title>" or
   * "Saved <title>", and the toast names it. */
  eventName?: string;
  /** "boxed" (default) is the bordered icon, "plain" the unboxed icon for
   * list rows, and "labeled" prints Save or Saved beside the bookmark. */
  appearance?: keyof typeof SHAPE;
  className?: string;
}) {
  const mounted = useMounted();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const savedState = useEventSavedState(eventId);
  // Before mount the device store has not been read. The placeholder shows
  // the unsaved control and claims nothing, as SaveButton's does.
  const isSaved = mounted && savedState === true;
  const unavailable = mounted && savedState === null;
  const setSaved = useSetEventSaved(eventId);
  const eventName = name || "event";

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
        // Undo usually fires after the card has left the screen, so a failed
        // restore keeps a way back on the error toast itself.
        onRetry: undoing ? () => void change(next, true) : undefined,
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // The name and the visible word follow the confirmed state. While a write
  // is pending they hold still and aria-busy says so, so the labeled shape
  // never changes width mid-tap.
  const word = unavailable ? "Unavailable" : isSaved ? "Saved" : "Save";

  return (
    <button
      type="button"
      data-save-ref={`event:${eventId}`}
      disabled={!mounted || savedState === null || busy}
      aria-hidden={mounted ? undefined : true}
      tabIndex={mounted ? undefined : -1}
      aria-busy={!mounted || busy || undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void change(!isSaved);
      }}
      aria-pressed={!mounted || unavailable ? undefined : isSaved}
      aria-label={!mounted ? undefined : unavailable ? `Saved state unavailable for ${eventName}` : `${word} ${eventName}`}
      title={!mounted ? undefined : unavailable ? "Saved state unavailable" : word}
      data-save-appearance={appearance}
      className={`${SHAPE[appearance]} ${className}`}
      style={{
        // The saved state uses the link color in every shape. Unsaved, each
        // shape takes the ink of the controls it sits beside.
        color: isSaved ? "var(--app-link)" : appearance === "boxed" ? "var(--app-ink)" : appearance === "plain" ? "var(--app-ink-3)" : "var(--app-ink-2)",
        background: appearance === "boxed" ? "var(--app-bg)" : undefined,
        borderColor: appearance === "boxed" ? "var(--app-control-border)" : appearance === "labeled" ? "var(--app-border)" : undefined,
      }}
    >
      <Bookmark className={appearance === "plain" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={isSaved ? 0 : 1.75} fill={isSaved ? "currentColor" : "none"} aria-hidden />
      {appearance === "labeled" ? (
        // A hidden "Saved" shares the word's grid cell, so Save and Saved
        // take one width and the sheet's action row keeps its wrap.
        <span data-save-word className="grid justify-items-center after:invisible after:col-start-1 after:row-start-1 after:content-['Saved']">
          <span className="col-start-1 row-start-1">{word}</span>
        </span>
      ) : null}
    </button>
  );
}
