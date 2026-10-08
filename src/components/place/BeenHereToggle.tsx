"use client";

import { useHasBeenThere, useToggleBeenThere } from "@/hooks/useBeenHere";
import { useMounted } from "@/hooks/useSaved";
import { CheckCircle2, Circle } from "lucide-react";

/**
 * A quiet, device-local "been here" marker. It is a 44px text toggle at the
 * end of the place page's visit section, not a pill on the first screen: it
 * records the visitor's own history and never competes with Directions
 * (October 2026 review: seven outlined controls shared the first phone
 * screen). The marked state is Ink, never a filled chip.
 */
const TOGGLE_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 text-meta-lg font-medium underline-offset-4 hover:underline";

export default function BeenHereToggle({ placeSlug, label }: { placeSlug: string; label: string }) {
  const mounted = useMounted();
  const been = useHasBeenThere(placeSlug);
  const toggle = useToggleBeenThere(placeSlug);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className={TOGGLE_CLASS}
        style={{ color: "var(--app-ink-2)" }}
      >
        <Circle className="h-4 w-4" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
        Mark as visited
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); toggle(); }}
      aria-pressed={been}
      aria-label={
        been
          ? `Been here: ${label}. Mark as not visited`
          : `Mark as visited: ${label}`
      }
      className={TOGGLE_CLASS}
      style={{ color: been ? "var(--app-ink)" : "var(--app-ink-2)" }}
    >
      {been ? (
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink)" }} />
      ) : (
        <Circle className="h-4 w-4" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      )}
      {been ? "Been here" : "Mark as visited"}
    </button>
  );
}
