"use client";

import { useHasBeenThere, useToggleBeenThere } from "@/hooks/useBeenHere";
import { useMounted } from "@/hooks/useSaved";
import { CheckCircle2, Circle } from "lucide-react";

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
        className="tap-44-y inline-flex items-center gap-2 rounded-[var(--app-radius-sm)] px-1 py-1.5 text-[14px] font-medium transition-colors"
        style={{ color: "var(--app-ink-2)" }}
      >
        <Circle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
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
      className="tap-44-y inline-flex items-center gap-2 rounded-[var(--app-radius-sm)] px-1 py-1.5 text-[14px] font-medium transition-colors"
      style={{ color: been ? "var(--app-cool-text)" : "var(--app-ink-2)" }}
    >
      {been ? (
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
      ) : (
        <Circle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      )}
      {been ? "Been here" : "Mark as visited"}
    </button>
  );
}
