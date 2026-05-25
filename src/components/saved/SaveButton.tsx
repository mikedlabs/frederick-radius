"use client";

import { useEffect, useState } from "react";
import { useIsSaved, useToggleSave, useMounted } from "@/hooks/useSaved";
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
  const isSaved = useIsSaved(refType, refId);
  const toggle = useToggleSave(refType, refId);
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
          toast(`Removed from saved`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        } else {
          toast.success(`Saved · ${label.replace(/^Save\s+/, "")}`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        }
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Unsave ${label}` : `Save ${label}`}
      title={isSaved ? "Saved" : "Save"}
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
