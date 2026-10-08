"use client";

import { useEventSavedState, useMounted, useSetEventSaved } from "@/hooks/useSaved";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

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
  const savedState = useEventSavedState(eventId);
  const isSaved = savedState === true;
  const setSaved = useSetEventSaved(eventId);
  const eventName = label?.replace(/^Add\s+/, "").replace(/\s+to itinerary$/, "") || "event";

  return (
    <button
      type="button"
      data-save-ref={`event:${eventId}`}
      disabled={!mounted || savedState === null}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const saved = setSaved(!isSaved);
          if (saved) toast.success(`Saved · ${eventName}`);
          else toast("Removed from Saved");
        } catch {
          toast.error(isSaved ? "Could not remove from Saved" : "Could not save this event", {
            description: "We could not confirm this change. Please try again.",
          });
        }
      }}
      aria-pressed={savedState === null ? undefined : mounted && isSaved}
      aria-label={savedState === null ? `Saved state unavailable for ${eventName}` : isSaved ? `Remove ${eventName} from Saved` : `Save ${eventName}`}
      title={savedState === null ? "Saved state unavailable" : isSaved ? "Saved" : "Save"}
      className={`tap-44 relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${className}`}
      style={{
        color: isSaved ? "var(--app-link)" : "var(--app-ink-2)",
        background: "var(--app-surface)",
        borderColor: "var(--app-border)",
      }}
    >
      <Bookmark className="h-4 w-4" strokeWidth={isSaved ? 0 : 1.75} fill={isSaved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
