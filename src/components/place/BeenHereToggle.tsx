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
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <Circle className="h-3.5 w-3.5" strokeWidth={1.75} />
        Been here
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
      className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: been ? "var(--app-cool)" : "var(--app-border)",
        background: been ? "var(--app-cool)" : "var(--app-bg-elevated)",
        color: been ? "white" : "var(--app-ink-2)",
      }}
    >
      {been ? (
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} fill="white" stroke="var(--app-cool)" aria-hidden />
      ) : (
        <Circle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      )}
      {been ? "Been here" : "Mark as visited"}
    </button>
  );
}
