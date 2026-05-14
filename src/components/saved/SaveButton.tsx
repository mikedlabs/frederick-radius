"use client";

import { useIsSaved, useToggleSave, useMounted } from "@/hooks/useSaved";
import { Bookmark } from "lucide-react";

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
        toggle();
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Unsave ${label}` : `Save ${label}`}
      title={isSaved ? "Saved" : "Save"}
      className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)]"
      style={{ color: isSaved ? "var(--app-cool)" : "var(--app-ink-3)" }}
    >
      <Bookmark
        className="h-4 w-4 transition-transform"
        strokeWidth={isSaved ? 0 : 1.75}
        fill={isSaved ? "currentColor" : "none"}
      />
    </button>
  );
}
