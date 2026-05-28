"use client";

import { useEffect, useState } from "react";
import { useIsSaved, useToggleSave, useMounted, useSavedList } from "@/hooks/useSaved";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { Bookmark } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

export default function SaveButton({
  refType,
  refId,
  label,
}: {
  refType: "place" | "event" | "radius";
  refId: string;
  label: string;
}) {
  const mounted = useMounted();
  // For places, route through the auth-aware useFollows hook: writes
  // hit the DB when signed in, fall back to localStorage when signed
  // out. Events + radii stay on the legacy useSaved hook by design
  // (Phase 1 brief framed sync as "follow PLACES"; broader sync later).
  const placeFollowed = useIsFollowed(refType === "place" ? refId : "");
  const togglePlace = useToggleFollow(refId, "icon");
  const legacyIsSaved = useIsSaved(refType, refId);
  const legacyToggle = useToggleSave(refType, refId);
  const isSaved = refType === "place" ? placeFollowed : legacyIsSaved;
  const toggle =
    refType === "place" ? () => void togglePlace() : legacyToggle;
  // Pre-toggle total. Used to detect the user's first save ever —
  // when totalBefore is 0 AND the user is about to save, the next
  // tap is the moment that promotes a stranger into someone who has
  // started keeping a list. Marked with editorial copy below.
  const totalBefore = useSavedList().length;
  // Track a brief "celebration" window after a fresh save so we can
  // overshoot-pop the icon and radiate a one-shot ring. The flag is
  // reset by an animation-end timer; the actual saved-state is the
  // source of truth. We use the "set state during render based on
  // prop change" pattern so we never cascade setState from an effect.
  const [celebrate, setCelebrate] = useState(false);
  const [prev, setPrev] = useState(isSaved);
  if (isSaved !== prev) {
    setPrev(isSaved);
    if (!prev && isSaved) setCelebrate(true);
  }
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 520);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="grid h-9 w-9 place-items-center rounded-full"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic(isSaved ? "light" : "medium");
        toggle();
        // Sonner toast — quiet, brand-aligned acknowledgement so the
        // user sees something happen even if the bookmark animation
        // is missed at a glance. Undo action mirrors the toggle so
        // a mistaken save is one tap to reverse.
        if (isSaved) {
          toast(`Removed from My Radius`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        } else if (totalBefore === 0) {
          // First add ever — moment worth marking. Editorial copy
          // instead of the routine acknowledgement, plus a longer
          // dwell so the user has time to read what just happened.
          toast.success("Your Radius starts here", {
            description: "Follow places you care about — they'll live in My Radius.",
            duration: 5000,
            action: { label: "Undo", onClick: () => toggle() },
          });
        } else {
          toast.success(`Added to My Radius · ${label.replace(/^Save\s+/, "")}`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        }
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove ${label} from My Radius` : `Add ${label} to My Radius`}
      title={isSaved ? "In My Radius" : "Add to My Radius"}
      className="relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.92]"
      style={{
        color: isSaved ? "var(--app-cool)" : "var(--app-ink-3)",
        transitionTimingFunction: "var(--app-ease-spring)",
      }}
    >
      <Bookmark
        className={`h-4 w-4 transition-transform ${
          celebrate ? "save-pop" : ""
        }`}
        strokeWidth={isSaved ? 0 : 1.75}
        fill={isSaved ? "currentColor" : "none"}
        style={{ transitionTimingFunction: "var(--app-ease-spring)" }}
      />
      {celebrate && (
        <span
          aria-hidden
          className="save-ring pointer-events-none absolute inset-0 rounded-full"
        />
      )}
    </button>
  );
}
