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
        className="tap-44-y inline-flex h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold transition-colors"
        style={{ color: "var(--app-ink)" }}
      >
        <Circle className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
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
      className="tap-44-y inline-flex h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold transition-colors hover:underline"
      style={{ color: been ? "var(--app-cool-text)" : "var(--app-ink)" }}
    >
      {been ? (
        <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      ) : (
        <Circle className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
      )}
      {been ? "Been here" : "Mark as visited"}
    </button>
  );
}
